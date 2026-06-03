import { URL } from 'url';
const parsed = new URL("http://localhost/api/download?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fv0%2Fb%2Fgen-lang-client-0900315510.firebasestorage.app%2Fo%2Fpayment_requests%252F1780403357150_%25E1%25BA%25A2nh%2520m%25C3%25A0n%2520h%25C3%25ACnh%25202026-06-02%2520l%25C3%25BAc%252019.21.40.png%3Falt%3Dmedia%26token%3D6519fb81-a4a0-4141-a5f2-2f23bcd547ef&filename=ok");
console.log(parsed.searchParams.get('url'));
