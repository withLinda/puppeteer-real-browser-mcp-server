import { setTimeout as sleep } from 'node:timers/promises';

export async function randomScroll(page: any) {
  const scrolls = Math.floor(Math.random() * 3) + 1;
  
  for (let i = 0; i < scrolls; i++) {
    const distance = Math.random() * 300 + 100;
    await page.evaluate((d: number) => {
      (window as any).scrollBy({ top: d, behavior: 'smooth' });
    }, distance);
    await sleep(Math.random() * 2000 + 1000);
  }
}