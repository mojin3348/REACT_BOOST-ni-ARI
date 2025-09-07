const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

let clients = [];

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  clients.push(res);

  req.on("close", () => {
    clients = clients.filter(c => c !== res);
  });
});

function sendEvent(message) {
  clients.forEach(res => res.write(`data: ${JSON.stringify(message)}\n\n`));
}

app.post("/boost", async (req, res) => {
  const { cookie, url, amount, interval, reactionType } = req.body;
  if (!cookie || !url || !amount || !interval || !reactionType) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const cookies = await convertCookie(cookie);
    if (!cookies) return res.status(400).json({ error: "Invalid cookies" });

    const id = await getPostID(url);
    if (!id) return res.status(400).json({ error: "Invalid post link/ID" });

    let count = 0;

    async function reactOnce() {
      try {
        const { fb_dtsg, jazoest } = await getTokens(cookies);

        const headers = {
          "Content-Type": "application/x-www-form-urlencoded",
          "cookie": cookies,
          "user-agent": "Mozilla/5.0",
        };

        const body = `fb_dtsg=${encodeURIComponent(fb_dtsg)}&jazoest=${encodeURIComponent(jazoest)}&reaction_type=${reactionType}&ft_ent_identifier=${id}`;

        const response = await axios.post(`https://mbasic.facebook.com/ufi/reaction/?ft_ent_identifier=${id}`, body, { headers });

        if (response.status === 200) {
          count++;
          sendEvent({ success: true, current: count, total: amount });
        } else {
          sendEvent({ success: false, current: count, total: amount });
        }

        if (count >= amount) clearInterval(timer);
      } catch (err) {
        sendEvent({ success: false, error: err.message });
        clearInterval(timer);
      }
    }

    const timer = setInterval(reactOnce, interval * 1000);

    res.json({ message: "🚀 Boost started" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function getPostID(url) {
  try {
    const response = await axios.post(
      "https://id.traodoisub.com/api.php",
      `link=${encodeURIComponent(url)}`,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    return response.data.id;
  } catch {
    return null;
  }
}

async function getTokens(cookies) {
  const res = await axios.get("https://mbasic.facebook.com/", {
    headers: { cookie: cookies, "user-agent": "Mozilla/5.0" },
  });
  const html = res.data;
  const fb_dtsg = (html.match(/name="fb_dtsg" value="([^"]+)"/) || [])[1];
  const jazoest = (html.match(/name="jazoest" value="([^"]+)"/) || [])[1];
  if (!fb_dtsg || !jazoest) throw new Error("Failed to extract fb_dtsg/jazoest");
  return { fb_dtsg, jazoest };
}

async function convertCookie(cookie) {
  try {
    const cookies = JSON.parse(cookie);
    return cookies.map(c => `${c.key}=${c.value}`).join("; ");
  } catch {
    return null;
  }
}

app.listen(5000, () => console.log("🚀 ReactBoost SSE server running on port 5000"));
