const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch();
  const page1 = await browser.newPage();
  const page2 = await browser.newPage();
  
  await page1.goto("http://localhost:3000/editor.html");
  await page1.click("#collabBtn");
  await page1.click("#collabCreateBtn");
  await new Promise(r => setTimeout(r, 2000));
  
  const status1 = await page1.$eval("#collabStatus", el => el.textContent);
  console.log("Status 1:", status1);
  const roomCode = status1.split(" ")[1];
  console.log("Room code:", roomCode);
  
  await page2.goto("http://localhost:3000/editor.html");
  await page2.click("#collabBtn");
  await page2.type("#collabCodeInput", roomCode);
  await page2.click("#collabJoinBtn");
  await new Promise(r => setTimeout(r, 2000));
  
  const status2 = await page2.$eval("#collabStatus", el => el.textContent);
  console.log("Join status:", status2);
  
  await browser.close();
})();
