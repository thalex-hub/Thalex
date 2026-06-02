const fs = require('fs');

async function testDownload() {
  const fileUrl = "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0900315510.firebasestorage.app/o/payment_requests%2F1780403357150_%E1%BA%A2nh%20m%C3%A0n%20h%C3%ACnh%202026-06-02%20l%C3%BAc%2019.21.40.png?alt=media&token=6519fb81-a4a0-4141-a5f2-2f23bcd547ef";
  const proxyUrl = `http://localhost:3000/api/download?url=${encodeURIComponent(fileUrl)}&filename=test.png`;
  
  console.log("Fetching from:", proxyUrl);
  const response = await fetch(proxyUrl);
  
  console.log("Status:", response.status);
  console.log("Headers:", response.headers);
  const buffer = await response.arrayBuffer();
  console.log("Bytes:", buffer.byteLength);
  
  if (buffer.byteLength > 0 && buffer.byteLength < 500) {
      console.log("Content:", Buffer.from(buffer).toString('utf-8'));
  }
}
testDownload().catch(console.error);
