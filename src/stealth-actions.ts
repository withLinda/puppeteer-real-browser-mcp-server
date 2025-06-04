export async function humanLikeMouseMove(page: any, x: number, y: number) {
  const steps = 20;
  const currentPosition = await page.evaluate(() => {
    const w = window as any;
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
    await page.waitForTimeout(Math.random() * 10 + 5);
  }
}

export async function humanLikeTyping(page: any, selector: string, text: string) {
  await page.click(selector);
  
  for (const char of text) {
    await page.keyboard.type(char);
    // Variable delay between 50-200ms
    await page.waitForTimeout(Math.random() * 150 + 50);
  }
}

export async function randomScroll(page: any) {
  const scrolls = Math.floor(Math.random() * 3) + 1;
  
  for (let i = 0; i < scrolls; i++) {
    const distance = Math.random() * 300 + 100;
    await page.evaluate((d: number) => {
      (window as any).scrollBy({ top: d, behavior: 'smooth' });
    }, distance);
    await page.waitForTimeout(Math.random() * 2000 + 1000);
  }
}