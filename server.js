const express = require('express');
const cors = require('cors');
const { WebcastConnection } = require('tiktok-live-connector');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// Hafızada tutulacak canlı yayın verileri
let state = {
    tiktokUsername: "",
    last100LikeUser: "None Yet",
    events: [], // { id, nickname, text, type }
    userLikes: {} // { uniqueId: totalLikes }
};

let eventCounter = 0;
let tiktokConnection = null;

function addEvent(nickname, text, type) {
    eventCounter++;
    state.events.push({
        id: eventCounter,
        nickname,
        text,
        type
    });
    if (state.events.length > 50) {
        state.events.shift();
    }
    console.log(`[${type.toUpperCase()}] ${nickname}: ${text}`);
}

// 1. Roblox Polling API
app.get('/api/stream', (req, res) => {
    res.json({
        last100LikeUser: state.last100LikeUser,
        events: state.events
    });
});

// 2. Connect API
app.post('/api/connect', (req, res) => {
    const { username } = req.body;
    
    if (!username) {
        return res.status(400).json({ error: "Username required" });
    }

    if (tiktokConnection) {
        try {
            tiktokConnection.disconnect();
        } catch (e) {}
    }

    state.tiktokUsername = username;
    state.last100LikeUser = "None Yet";
    state.events = [];
    state.userLikes = {};
    eventCounter = 0;

    addEvent("SYSTEM", `Connecting to live: @${username}...`, "chat");

    tiktokConnection = new WebcastConnection(username);

    tiktokConnection.connect().then(state => {
        addEvent("SYSTEM", `Successfully connected to Live!`, "join");
    }).catch(err => {
        addEvent("SYSTEM", `Failed to connect: ${err.message}`, "chat");
    });

    tiktokConnection.on('chat', data => {
        addEvent(data.nickname, data.comment, "chat");
    });

    tiktokConnection.on('member', data => {
        addEvent(data.nickname, "joined the stream", "join");
    });

    tiktokConnection.on('like', data => {
        const uniqueId = data.uniqueId;
        const likeCount = data.likeCount;
        const nickname = data.nickname || uniqueId;

        const currentLikes = state.userLikes[uniqueId] || 0;
        const oldMilestone = Math.floor(currentLikes / 100);
        
        const newLikes = currentLikes + likeCount;
        state.userLikes[uniqueId] = newLikes;
        
        const newMilestone = Math.floor(newLikes / 100);

        if (newMilestone > oldMilestone) {
            state.last100LikeUser = nickname;
            addEvent(nickname, `sent a total of ${newMilestone * 100} likes!`, "like");
        }

        // 2500 Beğeni (2.5k Like) Kontrolü
        const old25kMilestone = Math.floor(currentLikes / 2500);
        const new25kMilestone = Math.floor(newLikes / 2500);
        if (new25kMilestone > old25kMilestone) {
            addEvent(nickname, `dropped a massive like shower (2500+ likes)!`, "2.5k-like");
        }
    });

    tiktokConnection.on('gift', data => {
        addEvent(data.nickname, `sent a ${data.giftName} (x${data.repeatCount})`, "gift");
    });

    tiktokConnection.on('disconnected', () => {
        addEvent("SYSTEM", `Stream disconnected.`, "chat");
    });

    res.json({ status: "connecting", username });
});

app.listen(PORT, () => {
    console.log(`----------------------------------------`);
    console.log(`TikTok Roblox Bridge Sunucusu Başlatıldı!`);
    console.log(`Port: ${PORT}`);
    console.log(`----------------------------------------`);
});
