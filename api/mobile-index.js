const HOLDING_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Online booking temporarily unavailable | EPC Pro</title>
  <style>
    :root{--navy:#153047;--navy2:#1a3d5c;--orange:#f5a623;--ink:#172536;--muted:#627184;--line:#e4e9ef;--paper:#fff;--wash:#f4f6f9}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Arial,Helvetica,sans-serif;color:var(--ink);background:var(--wash)}
    body{display:flex;flex-direction:column;min-height:100vh}
    header{background:var(--navy2);padding:17px 24px;box-shadow:0 2px 12px rgba(9,28,43,.18)}
    .brand{width:min(100%,960px);margin:auto;display:flex;align-items:center;gap:12px;color:#fff;font-size:18px;font-weight:700;letter-spacing:-.2px}
    .mark{width:42px;height:42px;border-radius:11px;background:var(--orange);display:grid;place-items:center;box-shadow:0 6px 18px rgba(245,166,35,.23)}
    .mark svg{width:25px;height:25px}.brand span{color:var(--orange)}
    main{flex:1;display:grid;place-items:center;padding:44px 18px 56px;background:radial-gradient(circle at 50% 0,rgba(245,166,35,.12),transparent 330px),var(--wash)}
    .card{width:min(100%,680px);background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:46px 44px;text-align:center;box-shadow:0 18px 55px rgba(21,48,71,.12)}
    .status{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;margin:0 auto 22px;background:#fff4e6;border:1px solid #fbd3a0;color:#c36508;font-size:31px;font-weight:700}
    h1{margin:0 0 15px;color:var(--navy);font-size:clamp(28px,5vw,42px);line-height:1.12;letter-spacing:-.8px}
    .message{margin:0 auto 25px;max-width:560px;color:var(--muted);font-size:18px;line-height:1.62}
    .call-box{margin:0 auto 20px;padding:22px;border-radius:14px;background:#f7f9fb;border:1px solid var(--line)}
    .call-box p{margin:0 0 8px;color:var(--muted);font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.8px}
    .phone{display:inline-flex;align-items:center;justify-content:center;gap:10px;color:var(--navy);font-size:clamp(25px,6vw,34px);font-weight:800;text-decoration:none;letter-spacing:.4px}
    .phone:focus,.phone:hover{color:#b85e05;text-decoration:underline}.note{margin:0;color:#7a8795;font-size:14px;line-height:1.5}
    footer{background:var(--navy);color:rgba(255,255,255,.67);padding:17px 20px;text-align:center;font-size:13px}
    @media(max-width:560px){header{padding:14px 16px}.card{padding:34px 21px;border-radius:15px}.message{font-size:17px}.call-box{padding:19px 12px}}
  </style>
</head>
<body>
  <header>
    <div class="brand" aria-label="EPC Pro">
      <div class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M3 11.2 12 4l9 7.2v8.3a.5.5 0 0 1-.5.5h-17a.5.5 0 0 1-.5-.5v-8.3Z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M9 20v-6h6v6" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg></div>
      <div>EPC <span>PRO</span></div>
    </div>
  </header>
  <main>
    <section class="card" aria-labelledby="page-title">
      <div class="status" aria-hidden="true">!</div>
      <h1 id="page-title">Online booking is temporarily unavailable</h1>
      <p class="message">I’m very sorry, but at the moment there is a technical fault with this system. Please call us and we will take your booking manually.</p>
      <div class="call-box">
        <p>Call EPC Pro</p>
        <a class="phone" href="tel:+447831363622" aria-label="Call EPC Pro on 07831 363 622">07831 363 622</a>
      </div>
      <p class="note">Our team will be happy to arrange your EPC appointment by phone.</p>
    </section>
  </main>
  <footer>© EPC Pro · Professional Energy Performance Certificates</footer>
</body>
</html>`;

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(503).send(HOLDING_PAGE);
};

