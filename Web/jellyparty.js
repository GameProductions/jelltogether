class JellyPartyApp {
    constructor() {
        this.currentRoom = null;
        this.currentUser = "You"; 
        this.lastUpdate = new Date(0).toISOString();
        this.isPolling = false;
        this.reactionCount = 0;
        this.isVR = false;
        this.isAmbientSync = false;
        this.lang = 'en';
        this.t = JELLYPARTY_I18N[this.lang];
        
        // Dirty checking caches
        this._lastCinemaData = null;
        this._lastParticipantData = null;
        this._lastQueueData = null;
        this._lastTheoryData = null;
        this._lastMediaTitle = "";

        this.init();
    }

    async init() {
        console.log("JellyParty Phase 12 (Stage Orchestrator) Initializing...");
        const params = new URLSearchParams(window.location.search);
        const inviteCode = params.get('code');
        await this.loadRooms();
        this.startLobbyPolling();
        this.checkVR();
        this.createStars();
        this.setupEventHandlers();
        if (inviteCode) this.joinByCode(inviteCode);
    }

    setupEventHandlers() {
        document.getElementById('chat-input').onkeypress = (e) => { if (e.key === 'Enter') this.sendMessage(); };
        document.getElementById('join-code-input').onkeypress = (e) => { if (e.key === 'Enter') this.joinByCode(); };
    }

    // Discord Stage Logic
    async saveDiscordStage() {
        const stageId = document.getElementById('discord-stage-id').value.trim();
        const botToken = document.getElementById('discord-bot-token').value.trim();
        if (!stageId || !botToken) return alert("Please enter both ID and Token.");
        
        try {
            await fetch(`/JellyParty/Rooms/${this.currentRoom.id}/DiscordStage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ botToken, stageId })
            });
            alert("Discord Stage Configured!");
        } catch (e) { console.error("Discord Config Error:", e); }
    }

    async syncDiscordStage(titleOverride = null) {
        const title = titleOverride || prompt("Enter topic to sync to Discord:", this._lastMediaTitle);
        if (!title) return;
        try {
            await fetch(`/JellyParty/Rooms/${this.currentRoom.id}/SyncStage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(title)
            });
            console.log("Discord Stage Synced:", title);
        } catch (e) { console.error("Discord Sync Error:", e); }
    }

    // Engagement Features
    async addToQueue() {
        const title = prompt("Search Media / Enter Title:");
        if (!title) return;
        try {
            const resp = await fetch(`/JellyParty/Rooms/${this.currentRoom.id}/Queue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(title)
            });
            if (!resp.ok) console.error("Failed to add to queue");
        } catch (e) { console.error("Queue Error:", e); }
    }

    async addTheory() {
        const text = prompt("Enter your theory / observation:");
        if (!text) return;
        try {
            await fetch(`/JellyParty/Rooms/${this.currentRoom.id}/Theories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(text)
            });
            if (!resp.ok) console.error("Failed to add theory");
        } catch (e) { console.error("Theory Error:", e); }
    }

    renderQueue() {
        const dataStr = JSON.stringify(this.currentRoom.queue);
        if (dataStr === this._lastQueueData) return;
        this._lastQueueData = dataStr;

        const container = document.getElementById('queue-panel');
        if (!this.currentRoom.queue.length) return container.innerHTML = '<div class="loading">Queue is empty.</div>';
        container.innerHTML = this.currentRoom.queue.map(item => `
            <div class="queue-item">
                <span>${item.title}</span>
                <span style="font-size: 0.7rem; color: var(--text-dim);">Added by ${item.addedBy}</span>
            </div>
        `).join('');
    }

    renderTheories() {
        const dataStr = JSON.stringify(this.currentRoom.theories);
        if (dataStr === this._lastTheoryData) return;
        this._lastTheoryData = dataStr;

        const container = document.getElementById('theory-board');
        const notes = this.currentRoom.theories.map(note => `
            <div class="sticky-note">
                <strong>${note.author}</strong><br>${note.text}
            </div>
        `).join('');
        container.innerHTML = `<button class="action-btn" onclick="app.addTheory()" style="height: 150px; width: 150px; flex-shrink: 0;">+ New Theory</button>${notes}`;
    }

    renderCinemaSeats() {
        const dataStr = JSON.stringify(this.currentRoom.cinemaSeats);
        if (dataStr === this._lastCinemaData) return;
        this._lastCinemaData = dataStr;

        const container = document.getElementById('cinema-seats');
        container.innerHTML = '';
        for (let i = 0; i < 40; i++) {
            const seat = document.createElement('div');
            seat.className = 'seat';
            const occupant = Object.entries(this.currentRoom.cinemaSeats).find(([uid, s]) => s === i);
            if (occupant) {
                seat.classList.add('occupied');
                seat.title = occupant[0];
            }
            container.appendChild(seat);
        }
    }

    // VR & Ambient
    async checkVR() {
        if (navigator.xr) {
            const isSupported = await navigator.xr.isSessionSupported('immersive-vr');
            if (isSupported) document.getElementById('btn-vr-mode').style.display = 'block';
        }
        if (navigator.userAgent.includes('OculusBrowser') || navigator.userAgent.includes('Quest')) {
            document.getElementById('btn-vr-mode').style.display = 'block';
        }
    }

    createStars() {
        const container = document.getElementById('vr-stars');
        if (!container) return;
        for (let i = 0; i < 150; i++) {
            const star = document.createElement('div');
            star.className = 'star';
            star.style.left = `${Math.random() * 100}%`;
            star.style.top = `${Math.random() * 100}%`;
            star.style.width = star.style.height = `${Math.random() * 3 + 1}px`;
            star.style.setProperty('--duration', `${Math.random() * 3 + 2}s`);
            container.appendChild(star);
        }
    }

    toggleImmersiveMode() {
        this.isVR = !this.isVR;
        document.body.classList.toggle('theme-vr', this.isVR);
        const btn = document.getElementById('btn-vr-mode');
        btn.innerText = this.isVR ? "✖ Exit VR" : "🥽 Enter VR";
        if (this.isVR && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
        else if (!this.isVR && document.exitFullscreen) document.exitFullscreen();
    }

    // API Handlers
    async loadRooms() {
        try {
            const resp = await fetch('/JellyParty/Rooms');
            const rooms = await resp.json();
            this.renderRoomGrid(rooms);
        } catch (e) { console.error("Lobby Load Error:", e); }
    }

    renderRoomGrid(rooms) {
        const grid = document.getElementById('room-grid');
        if (!grid) return;
        if (!rooms.length) return grid.innerHTML = `<div class="loading">${this.t.no_rooms}</div>`;
        grid.innerHTML = rooms.map(room => `
            <div class="room-card" onclick="app.joinRoom('${room.id}')">
                <h3>${room.name}</h3>
                <div class="meta"><span>👥 ${room.participants.length}</span></div>
                <button class="btn-join">${this.t.join_btn}</button>
            </div>
        `).join('');
    }

    async joinRoom(roomId, inviteCode = null) {
        try {
            const url = `/JellyParty/Rooms/${roomId}/Join${inviteCode ? `?code=${inviteCode}` : ''}`;
            const joinResp = await fetch(url, { method: 'POST' });
            if (!joinResp.ok) throw new Error("Join failed");
            
            const resp = await fetch(`/JellyParty/Rooms/${roomId}`);
            this.currentRoom = await resp.json();
            this.showView('party');
            this.startRoomPolling();
            this.updateUIState();
        } catch (e) { console.error("Join Error:", e); alert("Failed to join room."); }
    }

    async joinByCode(codeOverride = null) {
        const code = (codeOverride || document.getElementById('join-code-input').value).trim().toUpperCase();
        if (!code) return;
        try {
            const resp = await fetch(`/JellyParty/Rooms/ByCode/${code}`);
            if (resp.status === 404) return alert("Invalid code.");
            const room = await resp.json();
            this.joinRoom(room.id, code);
        } catch (e) { console.error("Code Join Error:", e); }
    }

    async leaveRoom() {
        if (!this.currentRoom) return;
        try {
            await fetch(`/JellyParty/Rooms/${this.currentRoom.id}/Leave`, { method: 'POST' });
            this.currentRoom = null;
            if (this.isVR) this.toggleImmersiveMode();
            this.showView('lobby');
            this.stopRoomPolling();
            this.applyTheme('default');
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) { console.error("Leave Error:", e); }
    }

    // UI State
    updateUIState() {
        if (!this.currentRoom) return;
        const amAdmin = this.canManage();
        const amOwner = this.isOwner();

        document.getElementById('poll-section').style.display = 'block';
        document.getElementById('btn-new-poll').style.display = amAdmin ? 'flex' : 'none';
        
        const themeControls = document.getElementById('host-theme-controls');
        if (themeControls) themeControls.style.display = amAdmin ? 'block' : 'none';

        const discordControls = document.getElementById('host-discord-stage');
        if (discordControls) discordControls.style.display = amOwner ? 'block' : 'none';
        
        const canInvite = amAdmin || this.currentRoom.allowParticipantInvites;
        const inviteContainer = document.getElementById('invite-code-container');
        if (inviteContainer) inviteContainer.style.display = canInvite ? 'flex' : 'none';

        const inviteToggleBtn = document.getElementById('btn-toggle-participant-invites');
        if (inviteToggleBtn) {
            inviteToggleBtn.style.display = amOwner ? 'inline-block' : 'none';
            inviteToggleBtn.innerText = this.currentRoom.allowParticipantInvites ? '🤝' : '👤';
        }

        document.getElementById('participant-count').innerText = `${this.currentRoom.participants.length} participants`;
        document.getElementById('current-room-name').innerText = this.currentRoom.name;

        // Auto-sync Discord if title changed
        const currentTitle = "Interstellar"; // Mock from player integration
        if (amOwner && currentTitle !== this._lastMediaTitle) {
            this._lastMediaTitle = currentTitle;
            this.syncDiscordStage(currentTitle);
        }

        this.renderParticipants();
        this.renderPolls();
        this.renderChat();
        this.renderQueue();
        this.renderTheories();
        this.renderCinemaSeats();
        if (!this.isVR) this.applyTheme(this.currentRoom.currentTheme);
        this.checkReactions();
    }

    // Helpers
    async sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text || !this.currentRoom) return;
        input.value = '';
        try {
            await fetch(`/JellyParty/Rooms/${this.currentRoom.id}/Messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(text)
            });
        } catch (e) { console.error("Send Message Error:", e); }
    }

    async sendReaction(emoji) {
        if (!this.currentRoom) return;
        this.triggerReaction(emoji); 
        try {
            await fetch(`/JellyParty/Rooms/${this.currentRoom.id}/Reactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(emoji)
            });
        } catch (e) { console.error("Send Reaction Error:", e); }
    }

    triggerReaction(emoji) {
        const player = document.querySelector('.player-placeholder');
        if (!player) return;
        const el = document.createElement('div');
        el.className = 'floating-reaction';
        el.innerText = emoji;
        el.style.left = `${Math.random() * 60 + 20}%`;
        player.appendChild(el);
        setTimeout(() => el.remove(), 2000);
    }

    checkReactions() {
        if (!this.currentRoom.recentReactions) return;
        if (this.currentRoom.recentReactions.length > this.reactionCount) {
            const newReactions = this.currentRoom.recentReactions.slice(this.reactionCount);
            newReactions.forEach(r => this.triggerReaction(r));
            this.reactionCount = this.currentRoom.recentReactions.length;
        } else if (this.currentRoom.recentReactions.length < this.reactionCount) {
            this.reactionCount = this.currentRoom.recentReactions.length;
        }
    }

    async pollRoom() {
        if (!this.isPolling || !this.currentRoom) return;
        try {
            const resp = await fetch(`/JellyParty/Rooms/${this.currentRoom.id}/Updates?since=${this.lastUpdate}`);
            if (resp.status === 200) {
                this.currentRoom = await resp.json();
                this.lastUpdate = this.currentRoom.lastUpdated;
                this.updateUIState();
            }
        } catch (e) { console.error("Room Polling Error:", e); }
        setTimeout(() => this.pollRoom(), 2000);
    }

    renderChat() {
        const container = document.getElementById('chat-messages');
        container.innerHTML = this.currentRoom.messages.map(msg => `
            <div class="message ${msg.userName === this.currentUser ? 'sent' : 'received'}">
                <span class="user">${msg.userName}</span>${msg.text}
            </div>
        `).join('');
        container.scrollTop = container.scrollHeight;
    }

    renderParticipants() {
        const dataStr = JSON.stringify(this.currentRoom.participants);
        if (dataStr === this._lastParticipantData) return;
        this._lastParticipantData = dataStr;

        const list = document.getElementById('participant-list');
        list.innerHTML = this.currentRoom.participants.map(userId => `
            <div class="participant-item">
                <span class="user-name">${userId}</span>
                ${this.currentRoom.ownerId === userId ? '<span class="role-badge role-owner">Host</span>' : ''}
            </div>
        `).join('');
    }

    renderPolls() {
        const container = document.getElementById('poll-list');
        if (!this.currentRoom.activePolls.length) return container.innerHTML = 'No polls.';
        container.innerHTML = this.currentRoom.activePolls.map(poll => `
            <div class="poll-card">
                <div class="poll-question">${poll.question}</div>
                ${poll.options.map(opt => `<div class="poll-option">${opt}</div>`).join('')}
            </div>
        `).join('');
    }

    applyTheme(theme) { document.body.className = theme === 'default' ? '' : `theme-${theme}`; }
    showView(view) {
        document.getElementById('lobby-view').style.display = view === 'lobby' ? 'block' : 'none';
        document.getElementById('party-view').style.display = view === 'party' ? 'block' : 'none';
    }
    startLobbyPolling() { setInterval(() => { if (!this.currentRoom) this.loadRooms(); }, 5000); }
    startRoomPolling() { this.isPolling = true; this.pollRoom(); }
    stopRoomPolling() { this.isPolling = false; }
    canManage() { return this.isOwner() || (this.currentRoom && this.currentRoom.coHostIds.includes(this.currentUser)); }
    isOwner() { return this.currentRoom && this.currentRoom.ownerId === this.currentUser; }
    
    // Sharing Logic
    async generateAdvancedInvite() {
        const canChat = document.getElementById('invite-can-chat').checked;
        const canControl = document.getElementById('invite-can-control').checked;
        const hours = parseInt(document.getElementById('invite-expiration').value);
        try {
            const resp = await fetch(`/JellyParty/Rooms/${this.currentRoom.id}/Invitations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ canChat, canControl, hoursValid: hours, maxUses: 0 })
            });
            const invite = await resp.json();
            this.showInviteLink(invite.code);
        } catch (e) { console.error("Invite Gen Error:", e); }
    }
    showInviteLink(code) {
        const url = new URL(window.location.href);
        url.searchParams.set('code', code);
        const link = url.toString();
        const qrContainer = document.getElementById('qr-container');
        if (qrContainer) qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(link)}&color=4a00e0" style="width: 100%;">`;
        document.getElementById('share-link-text').value = link;
        document.getElementById('invite-code-text').innerText = code;
    }
    showShareModal() { this.showInviteLink(this.currentRoom.roomCode); document.getElementById('share-modal').style.display = 'block'; document.getElementById('modal-overlay').style.display = 'block'; }
    hideShareModal() { document.getElementById('share-modal').style.display = 'none'; document.getElementById('modal-overlay').style.display = 'none'; }
    async copyShareLink() { await navigator.clipboard.writeText(document.getElementById('share-link-text').value); }
    async copyInvite() { await navigator.clipboard.writeText(document.getElementById('invite-code-text').innerText); }
}

const app = new JellyPartyApp();
window.app = app;
