import { spawn } from "child_process";
import fs from "fs";

// ==============================
// LOAD BUTIK
// ==============================
const butikList = JSON.parse(fs.readFileSync("./butik.json", "utf8"));
const butikCodes = butikList.map((b) => b.code);

// ==============================
// SETTINGS MULTI BOT
// ==============================
const MAX_PARALLEL = 4;
const DELAY_BETWEEN_BOTS = 2500;
const RETRY_DELAY = 4000;
const ENABLE_RETRY = true;

// ==============================
// LOAD SCHEDULE
// ==============================
function loadSchedule() {
  const raw = fs.readFileSync("./schedule.json", "utf8");
  const data = JSON.parse(raw);

  if (!data.times || !Array.isArray(data.times) || data.times.length === 0) {
    console.error("❌ schedule.json harus punya array 'times'");
    process.exit(1);
  }

  return data.times.map((t) => {
    const [h, m] = t.split(":").map(Number);
    return { hour: h, minute: m };
  });
}

// ==============================
// RUN SCRAPER 1 BOUTIQUE
// ==============================
async function runScraper(code) {
  console.log(`\n🔸 Menjalankan scraper untuk butik: ${code}`);

  return new Promise(async (resolve) => {
    const bot = spawn("node", ["scrape-logammulia.js", code], {
      stdio: "inherit",
    });

    bot.on("exit", async (exitCode) => {
      if (exitCode !== 0) {
        console.log(`❌ Scraper ${code} gagal dengan kode: ${exitCode}`);

        if (ENABLE_RETRY) {
          console.log(`⏳ Retry dalam ${RETRY_DELAY / 1000} detik...`);
          await delay(RETRY_DELAY);
          console.log(`🔁 Retry scraper butik: ${code}`);
          await runScraper(code);
        }

        return resolve();
      }

      console.log(`✔️ Scraper selesai untuk butik: ${code}`);
      resolve();
    });
  });
}

// ==============================
// QUEUE RUNNER
// ==============================
async function runAllBoutiques() {
  console.log("\n🚀 Memulai scraping seluruh butik...\n");

  const queue = [...butikCodes];
  let active = 0;

  while (queue.length > 0) {
    if (active < MAX_PARALLEL) {
      const code = queue.shift();
      active++;

      runScraper(code).then(() => {
        active--;
      });

      await delay(DELAY_BETWEEN_BOTS);
    } else {
      await delay(1000);
    }
  }

  console.log("\n🎉 Semua butik telah diselesaikan!");
}

// ==============================
// FORMAT TIME
// ==============================
function formatTime(ms) {
  let total = Math.floor(ms / 1000);
  let h = String(Math.floor(total / 3600)).padStart(2, "0");
  let m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  let s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// ==============================
// HITUNG NEXT SCHEDULE
// ==============================
function getNextSchedule(schedules) {
  const now = new Date();
  let next = null;

  for (const sc of schedules) {
    const target = new Date();
    target.setHours(sc.hour);
    target.setMinutes(sc.minute);
    target.setSeconds(0);
    target.setMilliseconds(0);

    if (target > now) {
      next = target;
      break;
    }
  }

  if (!next) {
    const first = schedules[0];
    next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(first.hour);
    next.setMinutes(first.minute);
    next.setSeconds(0);
    next.setMilliseconds(0);
  }

  return next;
}

// ==============================
// WAIT FOR NEXT RUN
// ==============================
function waitForNextRun() {
  const schedules = loadSchedule();
  const target = getNextSchedule(schedules);

  console.log(`\n⏳ Countdown menuju ${target.toTimeString().slice(0, 5)}`);

  const interval = setInterval(() => {
    const now = new Date();
    const diff = target - now;

    if (diff <= 0) {
      clearInterval(interval);
      console.log("\n🎯 WAKTU TEPAT! Menjalankan scraping...\n");

      runAllBoutiques().then(() => {
        setTimeout(waitForNextRun, 2000);
      });
      return;
    }

    const countdown = formatTime(diff);
    process.stdout.write(`\r⏳ Mulai dalam ${countdown}   `);

  }, 1000);
}

// ==============================
// START PROGRAM
// ==============================
function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

waitForNextRun();
