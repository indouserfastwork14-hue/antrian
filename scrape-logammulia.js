import puppeteer from "puppeteer";
import fs from "fs";
import Pusher from "pusher";
import mysql from "mysql2/promise";

let db; // <-- deklarasi dulu


const pusher = new Pusher({
  appId: "2077665",
  key: "6a89a9973d3b4ded0b92",
  secret: "17101659412aa7670d5f",
  cluster: "ap1",
  useTLS: true,
});


async function setLokasiButik(page, kode) {
  console.log(`📍 Mengubah lokasi butik ke: ${kode}`);

  await page.goto("https://www.logammulia.com/id/change-location", {
    waitUntil: "networkidle2",
    timeout: 0,
  });

  const selectName = await page.evaluate(() => {
    const selects = document.querySelectorAll("select");
    for (const s of selects) {
      if (s.options.length > 3) return s.getAttribute("name");
    }
    return null;
  });

  if (!selectName) throw new Error("❌ Tidak menemukan dropdown lokasi butik!");

  console.log("✔ Dropdown butik ditemukan:", selectName);

  await page.select(`select[name='${selectName}']`, kode);

  const submitBtn = await page.$("button[type='submit'], input[type='submit']");
  if (!submitBtn) throw new Error("❌ Tombol submit lokasi tidak ditemukan!");

  await Promise.all([
    submitBtn.click(),
    page.waitForNavigation({ waitUntil: "networkidle2" }),
  ]);

  console.log("✔ Lokasi butik berhasil diubah.\n");
}

async function scrapePurchaseGold(page) {
  console.log("🔍 Masuk ke halaman pembelian emas...");

  await page.goto("https://logammulia.com/id/purchase/gold", {
    waitUntil: "networkidle2",
    timeout: 0,
  });

  console.log("⏳ Mengambil data produk dari <form id='purchase'>...\n");

  const data = await page.evaluate(() => {
    const rows = document.querySelectorAll("#purchase .ctr");
    const result = [];

    rows.forEach((row) => {
      const rawText = row.querySelector(".ngc-text");
      const name = rawText
        ? rawText.childNodes[0].textContent.trim()
        : "Nama tidak ditemukan";

      const displayPrice =
        row.querySelector(".item-2")?.innerText.trim() || "-";

      const noStockTag = row.querySelector(".no-stock");
      const status = noStockTag ? "Belum tersedia" : "Tersedia";

      const idVariant =
        row.querySelector("input[name='id_variant[]']")?.value || null;

      const qtyInput = row.querySelector("input[name='qty[]']");
      const numericPrice = qtyInput?.getAttribute("price") || null;
      const weight = qtyInput?.getAttribute("weight") || null;

      result.push({
        name,
        display_price: displayPrice,
        price: numericPrice,
        status,
        id_variant: idVariant,
        weight,
      });
    });

    return result;
  });

  return data;
}

function formatTanggal() {
  const now = new Date();
  const pad = (n) => (n < 10 ? "0" + n : n);

  return (
    now.getFullYear() +
    "-" +
    pad(now.getMonth() + 1) +
    "-" +
    pad(now.getDate()) +
    " " +
    pad(now.getHours()) +
    ":" +
    pad(now.getMinutes()) +
    ":" +
    pad(now.getSeconds())
  );
}


async function main() {

   db = await mysql.createConnection({
    host: "localhost",
    user: "ronald",
    password: "ronald123",
    database: "logammulia_db"
  });

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/118 Safari/537.36"
  );

  // 🔥 Ambil kode butik dari argumen CLI
  const kodeButik = process.argv[2] || "AJK2";

  if (!process.argv[2]) {
    console.log("⚠ Tidak ada kode butik diberikan. Default: AJK2");
  } else {
    console.log("📌 Kode butik dari argument:", kodeButik);
  }

  await setLokasiButik(page, kodeButik);

  const produk = await scrapePurchaseGold(page);

  const tanggalSekarang = formatTanggal();

  const finalOutput = {
    tanggal: tanggalSekarang,
    butik: kodeButik,
    produk,
  };

  console.log("📦 HASIL SCRAPING:");
  console.log(JSON.stringify(finalOutput, null, 2));

  // SIMPAN FILE JSON
//   const timestampFile = tanggalSekarang.replace(/[: ]/g, "-");
//   const fileName = `hasil-${kodeButik}-${timestampFile}.json`;

//   fs.writeFileSync(fileName, JSON.stringify(finalOutput, null, 2));

//   console.log(`\n📁 File JSON tersimpan: ${fileName}`);

  // ==================================
  //   PUSHER REALTIME
  // ==================================
  await pusher.trigger("logammulia-channel", "scrape-update", {
    tanggal: tanggalSekarang,
    butik: kodeButik,
    produk,
  });

  console.log("📡 Data dikirim ke Pusher (realtime).");

  await simpanKeMySQL(kodeButik, produk, tanggalSekarang);
  console.log("💾 Semua produk yang tersedia sudah disimpan ke MySQL.");

  await browser.close();
}


async function simpanKeMySQL(butik, produk, tanggal) {
  for (const item of produk) {
    if (item.status === "Tersedia") {
      await db.execute(
        `INSERT INTO stok_logam (
           tanggal, butik, nama, display_price, harga, id_variant, weight, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tanggal,
          butik,
          item.name,
          item.display_price,
          item.price,
          item.id_variant,
          item.weight,
          item.status
        ]
      );
      console.log(`💾 Tersimpan ke MySQL: ${item.name}`);
    }
  }
}




main();
