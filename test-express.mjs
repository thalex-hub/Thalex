import express from 'express';
const app = express();
app.get('/test', (req, res) => {
   res.send(req.query.url);
});
const s = app.listen(0, async () => {
   const port = s.address().port;
   const u = "https://host/123_%E1%BA%A2nh.png?token=abc";
   const q = `http://localhost:${port}/test?url=${encodeURIComponent(u)}`;
   console.log("Requesting:", q);
   const res = await fetch(q);
   console.log("Express saw:", await res.text());
   s.close();
});
