// Renders the Unbeatable app icon and splash screens for iOS (run: npm run icons).
import sharp from "sharp";
const mark = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7d8bff"/><stop offset="1" stop-color="#b07cff"/></linearGradient></defs>
  <path d="M320 256v288a192 192 0 0 0 384 0V256" fill="none" stroke="url(#g)" stroke-width="104" stroke-linecap="round"/>
  <circle cx="704" cy="256" r="60" fill="#eef0fa"/>`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs><radialGradient id="bg" cx="0.75" cy="0.1" r="1"><stop offset="0" stop-color="#1a1d3a"/><stop offset="0.6" stop-color="#0b0d18"/></radialGradient></defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>${mark}</svg>`;
const splash = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732">
  <rect width="2732" height="2732" fill="#06070d"/>
  <g transform="translate(1110 1110) scale(0.5)">${mark}</g></svg>`;
await sharp(Buffer.from(icon)).flatten({ background: "#0b0d18" }).removeAlpha().png().toFile("assets/icon-only.png");
await sharp(Buffer.from(splash)).png().toFile("assets/splash.png");
await sharp(Buffer.from(splash)).png().toFile("assets/splash-dark.png");
await sharp(Buffer.from(icon)).resize(180, 180).png().toFile("public/apple-touch-icon.png");
console.log("icons written");
