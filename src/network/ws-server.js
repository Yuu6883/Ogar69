const uWS = require("uWebSockets.js");

const WebSocketHandler = require("./socket");
const Game = require("../game");

/** @param {ArrayBuffer} buffer */
const bufferToString = buffer => {
    const array = new Uint8Array(buffer);
    const chars = [];
    let index = 0;
    while (array[index] && index++ < array.length)
        chars.push(String.fromCharCode(array[index]));
    return chars.join("");
}

module.exports = class SocketServer {

    constructor() {
        this.game = new Game();
    }

    open() {
        if (this.listening || this.sock) return;
        this.listening = true;
        return new Promise(resolve => {
            uWS.App().ws("/", {
                idleTimeout: 10,
                maxBackpressure: 1024,
                maxPayloadLength: 512,
                compression: uWS.DEDICATED_COMPRESSOR_4KB,
                upgrade: (res, req, context) => {
                    console.log('Connection received from: "' + req.getUrl() + '" ip: ' + new Uint8Array(res.getRemoteAddress()).join("."));
                    res.upgrade({ url: req.getUrl() },
                        req.getHeader('sec-websocket-key'),
                        req.getHeader('sec-websocket-protocol'),
                        req.getHeader('sec-websocket-extensions'),
                        context);
                },
                open: ws => ws.sock = new WebSocketHandler(this.game, ws),
                message: (ws, message, isBinary) => {
                    if (!isBinary) ws.end(1003);
                    ws.sock.onMessage(new DataView(message));
                },
                close: (ws, code, message) => ws.sock.onDisconnect(code, bufferToString(message))
            }).listen("0.0.0.0", 3000, sock => {
                this.listening = false;
                this.sock = sock;
                console.log(`Server opened on port ${3000}`);
                resolve(true);
            });
        });
    }

    close() {
        this.sock && uWS.us_listen_socket_close(this.sock);
        this.sock = null;
        console.log(`Server closed`);
    }
}