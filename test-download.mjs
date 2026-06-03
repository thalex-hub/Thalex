import { URL } from 'url';

async function check() {
  const rawUrl = "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0900315510.firebasestorage.app/o/payment_requests%2F1780403357150_Ảnh%20màn%20hình%202026-06-02%20lúc%2019.21.40.png?alt=media&token=6519fb81-a4a0-4141-a5f2-2f23bcd547ef";
  
  console.log("Raw URL:", rawUrl);
  try {
     const res = await fetch(rawUrl);
     console.log("Status:", res.status);
     const text = await res.text();
     console.log("Response text:", text.slice(0, 200));
  } catch(e) {
     console.error(e);
  }
}

check();
