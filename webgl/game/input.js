const events = ["Feed", "Split", "Double Split", "Triple Split", "Quad Split", "Line Lock", "Respawn", "Clip", "Switch Tab", "32 Split", "64 Split", "128 Split", "256 Split"];
const defaultKeys = ["w", " ", "g", "z", "q", "f", "n", "r", "tab", "", "", "", ""];
const KeyNameMap = { " ": "SPACE", "": "NONE" };

module.exports = class Keyboard {
    /** @param {import("./hud")} hud */
    constructor(hud) {
        this.hud = hud;

        try {
            /** @type {string[]} */
            let keys = JSON.parse(localStorage.getItem("ogarx-keys"));
            if (!Array.isArray(keys) || 
                !keys.every(k => typeof k == "string"))
                throw new Error("Error parsing keybinds, resetting");
            if (keys.length > events.length) keys = keys.slice(0, events.length);
            else if (keys.length < events.length) keys = keys.concat(defaultKeys.slice(keys.length));
            this.keys = keys.map(k => k.toLowerCase());
        } catch (e) {
            console.error(e.message);
            this.keys = defaultKeys.concat([]);
        }

        this.menuElem = document.getElementById("key-menu");

        /** @type {Set<string>} */
        this.pressing = new Set();

        this.updateKeys();
        this.save();
    }

    save() {
        localStorage.setItem("ogarx-keys", JSON.stringify(this.keys));
    }

    updateKeys() {
        const keys = document.getElementById("keys");
        keys.innerHTML = "";

        this.labels = [];

        for (const i in events) {
            const label = document.createElement("span");
            const k = this.keys[i].toUpperCase();
            label.textContent = `${events[i]}`;
            const b = document.createElement("b");
            b.innerText = (KeyNameMap[k] || k).toUpperCase();
            b.classList.add("selectable");
            keys.appendChild(label);
            keys.appendChild(b);
            this.labels.push(b);

            b.addEventListener("mouseenter", _ => this.hovered = b);
            b.addEventListener("mouseleave", _ => this.hovered = null);
            b.addEventListener("click", e => {
                this.setKey(b, `MOUSE ${e.button}`);
                e.preventDefault();
                e.stopPropagation();
            });
        }
    }

    setKey(element = this.hovered, key = "") {
        if (!key || !key.length) return;
        const index = this.labels.indexOf(element);
        if (key.toLowerCase() === "delete" || !key) {
            element.innerText = "NONE";
            this.keys[index] = "";
        } else {
            element.innerText = (KeyNameMap[key] || key).toUpperCase();
            this.keys[index] = key.toLowerCase();
        }
        this.save();
    }

    /** @param {KeyboardEvent} e */
    keyDown(e) {
        if (e.ctrlKey) return;
        if (e.key == "Tab") e.preventDefault();
        if (e.key == "Escape") this.hud.toggle();
        if (e.key == "Enter") this.hud.toggle(this.hud.chatInput);
        if (this.pressing.has(e.key)) return;
        this.pressing.add(e.key);

        if (!e.key) return;
        const key = e.key.toLowerCase();

        if (this.hovered) return this.setKey(this.hovered, key);

        const action = events[this.keys.indexOf(key)];
        if (!action) return;
        const state = this.hud.state;

        switch (action) {
            case "Feed":         state.macro    = 1; break;
            case "Split":        state.splits   = 1; break;
            case "Double Split": state.splits   = 2; break;
            case "Triple Split": state.splits   = 3; break;
            case "Quad Split":   state.splits   = 4; break;
            case "Line Lock":    state.lineLock = 1; break;
            case "Respawn":      state.respawn  = 1; break;
            case "Clip":         state.clip     = 1; break;
            case "Switch Tab":   state.s_tab    = 1; break;
            case "32 Split":     state.splits   = 5; break;
            case "64 Split":     state.splits   = 6; break;
            case "128 Split":    state.splits   = 7; break;
            case "256 Split":    state.splits   = 8; break;
        }
    }

    /** @param {KeyboardEvent} e */
    keyUp(e) {
        if (e.ctrlKey || !e.key) return;
        this.pressing.delete(e.key);

        const key = e.key.toLowerCase();

        const action = events[this.keys.indexOf(key)];
        if (!action) return;
        const state = this.hud.state;

        switch (action) {
            case "Feed":         state.macro   = 0; break;
        }
    }

    blur() {
    }

    focus() {
        for (const k of this.pressing) this.keyUp(k);
        this.pressing.clear();
    }
}