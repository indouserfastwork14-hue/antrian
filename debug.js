// === debug.js (updated with auto-select Investasi/Pemakaian Pribadi) ===

import puppeteer from "puppeteer-core";
import fetch from "node-fetch";
import fs from "fs";
import Pusher from "pusher";
import mysql from "mysql2/promise";

async function getChromeWSEndpoint() {
  const debugUrl = "http://127.0.0.1:9222/json/version";
  const res = await fetch(debugUrl);
  const data = await res.json();
  return data.webSocketDebuggerUrl;
}

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

  await page.select(`select[name='${selectName}']`, kode);

  const submitBtn = await page.$("button[type='submit'], input[type='submit']");
  await Promise.all([
    submitBtn.click(),
    page.waitForNavigation({ waitUntil: "networkidle2" }),
  ]);

  console.log("✔ Lokasi butik berhasil diubah.\n");
}

async function autoSelectTujuanTransaksi(page) {
  console.log("⚙️ Auto memilih tujuan transaksi: Investasi/Pemakaian Pribadi (dengan deteksi modal lambat)");

  await page.evaluate(() => {
    let counter = 0;
    const intv = setInterval(() => {
      counter++;
      const sel = document.querySelector("#tujuan_transaksi");

      if (sel) {
        clearInterval(intv);

        sel.value = "Investasi";
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        console.log("➡️ Tujuan transaksi otomatis dipilih: Investasi");

        setTimeout(() => {
          const btn = document.querySelector("#change-destination-transaction-button");
          if (btn) btn.click();
        }, 500);
      }

      if (counter >= 15) clearInterval(intv);
    }, 200);
  });
}

// ORIGINAL FUNCTION BELOW REMOVED
async function autoSelectTujuanTransaksi_OLD(page) {
  console.log("⚙️ Auto memilih tujuan transaksi: Investasi/Pemakaian Pribadi");

  await page.evaluate(() => {
    if (!window.location.href.includes("change-destination-transaction")) return;

    const intv = setInterval(() => {
      let sel = document.querySelector("#tujuan_transaksi");

      if (sel) {
        clearInterval(intv);

        sel.value = "Investasi";
        sel.dispatchEvent(new Event("change", { bubbles: true }));

        console.log("➡️ Tujuan transaksi dipilih otomatis: Investasi");

        setTimeout(() => {
          const btn = document.querySelector("#change-destination-transaction-button");
          if (btn) btn.click();
        }, 500);
      }
    }, 200);
  });
}

async function forceSetTujuanTransaksi(page) {
  console.log("📌 Memaksa setting Tujuan Transaksi seperti setLokasiButik...");

  await page.goto("https://logammulia.com/id/change-destination-transaction", {
    waitUntil: "networkidle2",
    timeout: 0,
  });

  await page.waitForSelector("#tujuan_transaksi");
  await page.select("#tujuan_transaksi", "Investasi");

  await page.evaluate(() => {
    const el = document.querySelector("#tujuan_transaksi");
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const btn = await page.$("#change-destination-transaction-button");
  await Promise.all([
    btn.click(),
    page.waitForNavigation({ waitUntil: "networkidle2" }),
  ]);

  console.log("✔ Tujuan transaksi berhasil dipaksa di-set dan dikonfirmasi.");
}

async function scrapePurchaseGold(page) {
  await page.goto("https://logammulia.com/id/purchase/gold", {
    waitUntil: "networkidle2",
    timeout: 0,
  });

  // Auto isi semua qty jadi 1
  await page.evaluate(() => {
    document.querySelectorAll("input[name='qty[]']").forEach((input) => {
      input.value = 1;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  // Scrape data
  const data = await page.evaluate(() => {
    const rows = document.querySelectorAll("#purchase .ctr");
    const result = [];

    rows.forEach((row) => {
      const name = row.querySelector(".ngc-title")?.innerText.trim() || "-";
      const displayPrice = row.querySelector(".item-2")?.innerText.trim() || "-";
      const status = row.querySelector(".no-stock") ? "Belum tersedia" : "Tersedia";
      const idVariant = row.querySelector("input[name='id_variant[]']")?.value || null;
      const qty = row.querySelector("input[name='qty[]']");
      const price = qty?.getAttribute("price") || null;
      const weight = qty?.getAttribute("weight") || null;

      result.push({ name, display_price: displayPrice, price, weight, id_variant: idVariant, status });
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
    "-" + pad(now.getMonth() + 1) +
    "-" + pad(now.getDate()) +
    " " + pad(now.getHours()) +
    ":" + pad(now.getMinutes()) +
    ":" + pad(now.getSeconds())
  );
}

async function main() {
  const wsUrl = await getChromeWSEndpoint();
  console.log("🔥 Browser WS URL:", wsUrl);

  const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });
  const page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/118 Safari/537.36");

  const kodeButik = process.argv[2] || "AJK2";

  await setLokasiButik(page, kodeButik);

  // 🔥 Paksa set tujuan transaksi sebelum melanjutkan
  await forceSetTujuanTransaksi(page);

  // ⏳ Menunggu redirect setelah CONFIRM
  try {
    console.log("⏳ Menunggu redirect setelah set tujuan transaksi...");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 7000 });
  } catch (e) {
    console.log("⚠️ Redirect tidak terdeteksi, lanjut manual...");
  }

  // beri jeda agar LM stabil
  await new Promise(resolve => setTimeout(resolve, 800));

  // Auto pilih tujuan transaksi jika halaman muncul
  await autoSelectTujuanTransaksi(page);

  const produk = await scrapePurchaseGold(page);
  const tanggalSekarang = formatTanggal();

  console.log("📦 DATA PRODUK:", produk);
  console.log("🕒 Waktu:", tanggalSekarang);

  await browser.disconnect();
}

main();
