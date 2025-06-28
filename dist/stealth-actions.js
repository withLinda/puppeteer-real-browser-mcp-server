"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomScroll = randomScroll;
const promises_1 = require("node:timers/promises");
async function randomScroll(page) {
    const scrolls = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < scrolls; i++) {
        const distance = Math.random() * 300 + 100;
        await page.evaluate((d) => {
            window.scrollBy({ top: d, behavior: 'smooth' });
        }, distance);
        await (0, promises_1.setTimeout)(Math.random() * 2000 + 1000);
    }
}
