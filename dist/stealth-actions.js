"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.humanLikeMouseMove = humanLikeMouseMove;
exports.humanLikeTyping = humanLikeTyping;
exports.randomScroll = randomScroll;
const promises_1 = require("node:timers/promises");
async function humanLikeMouseMove(page, x, y) {
    const steps = 20;
    const currentPosition = await page.evaluate(() => {
        const w = window;
        return {
            x: w.mouseX || 0,
            y: w.mouseY || 0,
        };
    });
    for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease-out cubic
        const currentX = currentPosition.x + (x - currentPosition.x) * easeProgress;
        const currentY = currentPosition.y + (y - currentPosition.y) * easeProgress;
        await page.mouse.move(currentX, currentY);
        await (0, promises_1.setTimeout)(Math.random() * 10 + 5);
    }
}
async function humanLikeTyping(page, selector, text) {
    await page.click(selector);
    for (const char of text) {
        await page.keyboard.type(char);
        // Variable delay between 50-200ms
        await (0, promises_1.setTimeout)(Math.random() * 150 + 50);
    }
}
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
