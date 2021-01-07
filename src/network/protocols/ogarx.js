const Protocol = require("../protocol");
const Reader = require("../reader");
const Writer = require("../writer");

const DEAD_CELL_TYPE = 251;
const MOTHER_CELL_TYPE = 252;
const VIRUS_TYPE = 253;
const PELLET_TYPE = 254;
const EJECTED_TYPE = 255;

/** @extends {Protocol<import("../socket")<import("uWebSockets.js").WebSocket & import("../fake-socket")>>} */
module.exports = class OgarXProtocol extends Protocol {

    /** @param {DataView} view */
    static handshake(view) { 
        const reader = new Reader(view);
        return reader.length == 3 && 
            reader.readUInt8() == 69 &&
            reader.readInt16() == 420;
    }

    /** @param {BufferSource} buffer */
    static async init(buffer) {
        this.Module = await WebAssembly.compile(buffer);
    }

    /** @param {import("../socket")} handler */
    constructor(handler) {
        super(handler);
        this.init();

        this.last_vlist_ptr = 131072; // 2 * 64k or 2 ^ 17
        this.last_vlist_len = 0;
        this.curr_vlist_ptr = 131072; // 2 * 64k or 2 ^ 17
        this.curr_vlist_len = 0;
    }

    async init() {
        const { get_cell_x, get_cell_y, get_cell_r, 
            get_cell_type, get_cell_eatenby } = this.handler.game.engine.wasm;

        const memory = this.memory = new WebAssembly.Memory({ initial: 16, maximum: 32 }); // 1mb, 2mb
        this.wasm = await WebAssembly.instantiate(OgarXProtocol.Module, {
            env: { 
                memory,
                get_cell_x, get_cell_y, get_cell_r, 
                get_cell_type, get_cell_eatenby 
            }
        });

        this.handler.join();
        this.sendInitPacket();

        for (const c of this.handler.game.controls) {
            if (c.handle) this.onSpawn(c);
        }
    }

    sendInitPacket() {
        const writer = new Writer();
        writer.writeUInt8(1);
        writer.writeUInt16(this.handler.controller.id);
        writer.writeUInt16(this.handler.game.engine.options.MAP_HW);
        writer.writeUInt16(this.handler.game.engine.options.MAP_HH);
        this.handler.ws.send(writer.finalize(), true);
    }

    /** @param {DataView} view */
    onMessage(view) {
        const reader = new Reader(view);
        const OP = reader.readUInt8();
        const controller = this.handler.controller;

        switch (OP) {
            case 1:
                controller.name = reader.readUTF16String();
                controller.skin = reader.readUTF16String();
                controller.spawn = true;
                break;
            case 2:
                if (controller.alive) return;
                // TODO: spectate a target
            case 3:
                controller.mouseX = reader.readFloat32();
                controller.mouseY = reader.readFloat32();
                // controller.spectate TODO:
                const spectate = reader.readUInt8();
                const splits = reader.readUInt8();
                const ejects = reader.readUInt8();
                const macro = reader.readUInt8();
                controller.splitAttempts += splits;
                controller.ejectAttempts += ejects;
                controller.ejectMarco = Boolean(macro);
                break;
            case 10:
                const message = reader.readUTF16String();
                this.handler.game.chat.broadcast(this.handler.controller, message);
                break;
            case 69:
                const PONG = new ArrayBuffer(1);
                new Uint8Array(PONG)[0] = 69;                
                this.handler.ws.send(PONG, true); // PING-PONG
                break;
            default:
                console.warn(`Unknown OP: ${OP}`);
        }
    };

    onUpdate() {
        const engine = this.handler.game.engine;

        // Query visible cells from the controller
        const vlist = engine.query(this.handler.controller);

        // Step 1
        this.wasm.exports.move_hashtable();
        // Step 2
        this.wasm.exports.copy(this.last_vlist_ptr, this.curr_vlist_ptr, this.curr_vlist_len * 2);
        // Update ptr and len
        this.last_vlist_len = this.curr_vlist_len;
        this.curr_vlist_ptr = this.last_vlist_ptr + this.last_vlist_len * 2; // 2 bytes per index
        this.curr_vlist_len = vlist.length;
        new Uint16Array(this.memory.buffer, this.curr_vlist_ptr, this.curr_vlist_len)
            .set(vlist);
        
        const AUED_table_ptr = this.curr_vlist_ptr + this.curr_vlist_len * 2;
        
        // Step 3
        const AUED_end_ptr = this.wasm.exports.write_AUED(
            0, 65536,
            this.last_vlist_ptr, this.last_vlist_len,
            this.curr_vlist_ptr, this.curr_vlist_len,
            AUED_table_ptr, AUED_table_ptr + 16 // 4 * 4 bytes after the table
        );

        const view = new DataView(this.memory.buffer);
        const A_count = view.getUint32(AUED_table_ptr + 0,  true);
        const U_count = view.getUint32(AUED_table_ptr + 4,  true);
        const E_count = view.getUint32(AUED_table_ptr + 8,  true);
        const D_count = view.getUint32(AUED_table_ptr + 12, true);

        // console.log(`A: ${A_count}, U: ${U_count}, E: ${E_count}, D: ${D_count}`);
        // console.log(`AUED_end_ptr: ${AUED_end_ptr}`);
        
        const vx = this.handler.controller.viewportX;
        const vy = this.handler.controller.viewportY;

        // 1 byte OP + 4 bytes vx + 4 bytes vy + 4 * 2 bytes 0 padding = 17 bytes
        // We don't have to calculate this because serialize returns the write end
        // But this is a good way to verify it wrote as expect
        const buffer_length = 17 + 10 * A_count + 8 * U_count + 4 * E_count + 2 * D_count;
        
        const mem_check = AUED_end_ptr + buffer_length - this.memory.buffer.byteLength;
        if (mem_check > 0) {
            const extra_page = Math.ceil(mem_check / 65536);
            this.memory.grow(extra_page);
            console.log(`Growing ${extra_page} page of memory in ogar69 protocol ` +
                `memory for controller(${this.handler.controller.name})`);
        }

        // Step 4 serialize
        const buffer_end = this.wasm.exports.serialize(vx, vy, 
            AUED_table_ptr, AUED_table_ptr + 16, AUED_end_ptr);
        
        const diff = buffer_end - AUED_end_ptr;
        console.assert(diff == buffer_length, "Buffer length must match");

        this.handler.ws.send(this.memory.buffer.slice(AUED_end_ptr, buffer_end), true);
    }

    /** @param {import("../../game/controller")} controller */
    onSpawn(controller) {
        const writer = new Writer();
        writer.writeUInt8(3);
        writer.writeUInt16(controller.id);
        writer.writeUTF16String(controller.name);
        writer.writeUTF16String(controller.skin);
        this.handler.ws.send(writer.finalize(), true);
        
        if (this.handler.controller == controller) {
            const CLEAR_SCREEN = new ArrayBuffer(1);
            new Uint8Array(CLEAR_SCREEN)[0] = 2;
            this.handler.ws.send(CLEAR_SCREEN, true);
            this.wasm.exports.clean(0, this.memory.buffer.byteLength);
        }
    }

    /** 
     * @param {import("../../game/controller")} controller
     * @param {string} message
     */
    onChat(controller, message) {
        // Igore own chat
        if (controller == this.handler.controller) return;

        const writer = new Writer();
        writer.writeUInt8(10);
        writer.writeUInt16(controller ? controller.id : 0); // 0 is server
        writer.writeUTF16String(message);

        this.handler.ws.send(writer.finalize(), true);
    }

    onDisconnect(code, reason) {
        this.handler.remove();
    }
}