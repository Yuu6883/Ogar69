const { EventEmitter } = require("events");

const Controller = require("./controller");
const Engine = require("../physics/engine");
const OgarXProtocol = require("../network/protocols/ogarx");

const MAX_PLAYER = 250;

module.exports = class Game extends EventEmitter {

    constructor(name = "Server") {
        super();
        this.setMaxListeners(MAX_PLAYER + 1);
        this.name = name;
        this.engine = new Engine(this);
        this.controls = Array.from({ length: MAX_PLAYER }, (_, i) => new Controller(this.engine, i));
        this.handles = 0;

        this.on("oversize", /** @param {import("./controller")} c */ c => {
            try {
                this.emit("log", eval(`\`${this.engine.options.WORLD_OVERSIZE_MESSAGE}\``));
            } catch (e) {
                console.error(`Eval of "${this.engine.options.WORLD_OVERSIZE_MESSAGE}" failed in "oversize" listener: `, e);
            }
        });

        this.on("restart", () => this.emit("log", "Restarting Server..."));

        /** @type {{ message: string, isServer: boolean }[]} */
        this.history = [];
        this.on("chat", message => this.addChatHistory(message));
        this.on("log", message => this.addChatHistory(message, true));
    }

    addChatHistory(message, isServer = false) {
        this.history.push({ message, isServer });
        while (this.history.length > this.engine.options.CHAT_HISTORY) this.history.shift();
    }

    get playerCount() {
        return this.controls.reduce((prev, c) => (c.handle instanceof OgarXProtocol ? 1 : 0) + prev, 0);
    }

    get options() { return this.engine.options; }
    get isFull() { return this.handles >= MAX_PLAYER; }

    /** @param {import("./handle")} handle */
    addHandler(handle) {
        if (this.handles + (this.engine.options.DUAL_ENABLED ? 2 : 1) >= MAX_PLAYER) 
            return handle.onError("Server full");
        if (handle.controller) return;
        let id = 1; // 0 is occupied ig
        while (this.controls[id].handle) id++;
        this.controls[id].handle = handle;
        handle.controller = this.controls[id];
        // Prevent connection spam (can be done in client AND with kernel)?
        // handle.controller.lastSpawnTick = this.engine.__now;
        this.handles++;
    }

    /** @param {import("./handle")} handle */
    removeHandler(handle) {
        if (!handle.controller) return;
        const c = handle.controller;
        this.engine.delayKill(c.id, true);
        this.emit("leave", c);
        c.reset();
        handle.controller = null;
        this.handles--;
    }
}