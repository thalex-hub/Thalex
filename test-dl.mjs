import fs from 'fs';

async function testDownload() {
  const originalUrl = "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0900315510.firebasestorage.app/o/payment_requests%2F1780403357150_%E1%BA%A2nh%20m%C3%A0n%20h%C3%ACnh%202026-06-02%20l%C3%BAc%2019.21.40.png?alt=media&token=6519fb81-a4a0-4141-a5f2-2f23bcd547ef";
  
  console.log("Fetching originalUrl:", originalUrl);
  const response = await fetch(originalUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10._15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  
  console.log("Status:", response.status);
}
testDownload().catch(console.error);
