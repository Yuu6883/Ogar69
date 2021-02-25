const Handle = require("./handle");

module.exports = class DualHandle extends Handle {
    /** 
     * @param {Handle} owner
     */
    constructor(owner) {
        super(owner.game);
        this.owner = owner;
        this.join();
    }

    // Do nothing
    calculateViewport() {};
};