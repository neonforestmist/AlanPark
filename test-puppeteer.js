const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on("console", msg => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", err => console.log("PAGE ERROR:", err.message));
  
  await page.goto("http://localhost:3000/editor.html");
  
  await page.waitForSelector("#collabBtn");
  await page.click("#collabBtn");
  
  await page.waitForSelector("#collabCreateBtn");
  await page.click("#collabCreateBtn");
  
  await new Promise(r => setTimeout(r, 2000));
  
  const status = await page.$eval("#collabStatus", el => el.textContent);
  console.log("Status:", status);
  
  await browser.close();
})();
