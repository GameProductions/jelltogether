class JellTogetherApp {
    constructor() {
        this.currentRoom = null;
        this.currentUser = "Unknown";
        this.lastUpdate = new Date(0).toISOString();
        this.isPolling = false;
        this.pollTimer = null;
        this.reactionCount = 0;
        this.isVR = false;
        this.lang = 'en';
        this.t = JELL_TOGETHER_I18N[this.lang];

        this._lastCinemaData = null;
        this._lastParticipantData = null;
        this._lastQueueData = null;
        this._lastTheoryData = null;

        this.init();
    }

    async init() {
        const params = new URLSearchParams(window.location.search);
        const inviteCode = params.get('code');
        await this.loadCurrentUser();
        await this.loadRooms();
        this.startLobbyPolling();
        this.checkVR();
        this.createStars();
        this.setupEventHandlers();
        if (inviteCode) this.joinByCode(inviteCode);
    }

    setupEventHandlers() {
        const chatInput = document.getElementById('chat-input');
        const codeInput = document.getElementById('join-code-input');
        if (chatInput) chatInput.onkeypress = (e) => { if (e.key === 'Enter') this.sendMessage(); };
        if (codeInput) codeInput.onkeypress = (e) => { if (e.key === 'Enter') this.joinByCode(); };
    }

    async loadCurrentUser() {
        try {
            const user = await this.fetchJson('/jelltogether/CurrentUser');
            this.currentUser = user.id || user.name || "Unknown";
        } catch (e) {
            console.error("User Load Error:", e);
        }

        const display = document.getElementById('display-name');
        if (display) display.textContent = this.currentUser;
    }

    async fetchJson(url, options = {}) {
        const resp = await fetch(url, options);
        if (!resp.ok) throw new Error(`${options.method || 'GET'} ${url} failed with ${resp.status}`);
        if (resp.status === 204) return null;
        return resp.json();
    }

    jsonPost(url, value) {
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(value)
        });
    }

    resetRenderCaches() {
        this._lastCinemaData = null;
        this._lastParticipantData = null;
        this._lastQueueData = null;
        this._lastTheoryData = null;
    }

    clear(el) {
        if (el) el.replaceChildren();
    }

    textEl(tag, text, className = null) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        el.textContent = text;
        return el;
    }

    button(text, className, handler) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = className;
        btn.textContent = text;
        btn.onclick = handler;
        return btn;
    }

    async createRoom() {
        const name = prompt("Name this watch party:");
        if (!name || !name.trim()) return;

        try {
            const room = await this.fetchJson('/jelltogether/Rooms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(name.trim())
            });
            await this.joinRoom(room.id);
        } catch (e) {
            console.error("Create Room Error:", e);
            alert("Failed to create room.");
        }
    }

    async loadRooms() {
        try {
            const rooms = await this.fetchJson('/jelltogether/Rooms');
            this.renderRoomGrid(rooms);
        } catch (e) {
            console.error("Lobby Load Error:", e);
        }
    }

    renderRoomGrid(rooms) {
        const grid = document.getElementById('room-grid');
        if (!grid) return;
        this.clear(grid);

        if (!rooms.length) {
            grid.appendChild(this.textEl('div', this.t.no_rooms, 'loading'));
            return;
        }

        rooms.forEach(room => {
            const card = document.createElement('div');
            card.className = 'room-card';
            card.onclick = () => this.joinRoom(room.id);

            card.appendChild(this.textEl('h3', room.name || 'Untitled Party'));
            const meta = document.createElement('div');
            meta.className = 'meta';
            meta.appendChild(this.textEl('span', `Participants: ${room.participants?.length || 0}`));
            card.appendChild(meta);
            card.appendChild(this.button(this.t.join_btn, 'btn-join', (e) => {
                e.stopPropagation();
                this.joinRoom(room.id);
            }));
            grid.appendChild(card);
        });
    }

    async joinRoom(roomId, inviteCode = null) {
        try {
            const url = `/jelltogether/Rooms/${encodeURIComponent(roomId)}/Join${inviteCode ? `?code=${encodeURIComponent(inviteCode)}` : ''}`;
            const joinResp = await fetch(url, { method: 'POST' });
            if (!joinResp.ok) throw new Error("Join failed");

            this.currentRoom = await this.fetchJson(`/jelltogether/Rooms/${encodeURIComponent(roomId)}`);
            this.lastUpdate = this.currentRoom.lastUpdated || new Date(0).toISOString();
            this.reactionCount = this.currentRoom.recentReactions?.length || 0;
            this.resetRenderCaches();
            this.showView('party');
            this.startRoomPolling();
            this.updateUIState();
        } catch (e) {
            console.error("Join Error:", e);
            alert("Failed to join room.");
        }
    }

    async joinByCode(codeOverride = null) {
        const code = (codeOverride || document.getElementById('join-code-input').value).trim().toUpperCase();
        if (!code) return;

        try {
            const resp = await fetch(`/jelltogether/Rooms/ByCode/${encodeURIComponent(code)}`);
            if (resp.status === 404) return alert("Invalid code.");
            if (!resp.ok) throw new Error("Code lookup failed");
            const room = await resp.json();
            this.joinRoom(room.id, code);
        } catch (e) {
            console.error("Code Join Error:", e);
            alert("Failed to join by code.");
        }
    }

    async leaveRoom() {
        if (!this.currentRoom) return;
        try {
            await fetch(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Leave`, { method: 'POST' });
            this.currentRoom = null;
            if (this.isVR) this.toggleImmersiveMode();
            this.showView('lobby');
            this.stopRoomPolling();
            this.applyTheme('default');
            window.history.replaceState({}, document.title, window.location.pathname);
            await this.loadRooms();
        } catch (e) {
            console.error("Leave Error:", e);
        }
    }

    async toggleParticipantInvites() {
        await this.postRoomAction('ToggleParticipantInvites');
    }

    async togglePrivacy() {
        await this.postRoomAction('TogglePrivacy');
    }

    async toggleHostControl() {
        await this.postRoomAction('ToggleControl');
    }

    async setTheme(theme) {
        if (!this.currentRoom) return;
        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Theme`, theme);
            if (!resp.ok) throw new Error("Theme update failed");
            await this.refreshRoom();
        } catch (e) {
            console.error("Theme Error:", e);
        }
    }

    async postRoomAction(action) {
        if (!this.currentRoom) return;
        try {
            const resp = await fetch(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/${action}`, { method: 'POST' });
            if (!resp.ok) throw new Error(`${action} failed`);
            await this.refreshRoom();
        } catch (e) {
            console.error(`${action} Error:`, e);
        }
    }

    async refreshRoom() {
        if (!this.currentRoom) return;
        this.currentRoom = await this.fetchJson(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}`);
        this.lastUpdate = this.currentRoom.lastUpdated || this.lastUpdate;
        this.updateUIState();
    }

    updateUIState() {
        if (!this.currentRoom) return;

        const amAdmin = this.canManage();
        const amOwner = this.isOwner();

        document.getElementById('participant-section').style.display = 'block';
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
            inviteToggleBtn.style.display = amOwner ? 'inline-flex' : 'none';
            inviteToggleBtn.textContent = this.currentRoom.allowParticipantInvites ? 'Invites on' : 'Invites off';
        }

        const privacyBtn = document.getElementById('btn-toggle-privacy');
        if (privacyBtn) {
            privacyBtn.style.display = amOwner ? 'inline-flex' : 'none';
            privacyBtn.textContent = this.currentRoom.isPrivate ? 'Private' : 'Public';
        }

        const controlBtn = document.getElementById('btn-toggle-control');
        if (controlBtn) {
            controlBtn.style.display = amOwner ? 'inline-flex' : 'none';
            controlBtn.textContent = this.currentRoom.isHostOnlyControl ? 'Host control' : 'Open control';
        }

        document.getElementById('participant-count').textContent = `${this.currentRoom.participants.length} participants`;
        document.getElementById('current-room-name').textContent = this.currentRoom.name;
        document.getElementById('invite-code-text').textContent = this.currentRoom.roomCode;

        const canChat = this.canChat();
        document.getElementById('chat-input').disabled = !canChat;
        document.getElementById('btn-send').disabled = !canChat;

        this.renderParticipants();
        this.renderPolls();
        this.renderChat();
        this.renderQueue();
        this.renderTheories();
        this.renderCinemaSeats();
        if (!this.isVR) this.applyTheme(this.currentRoom.currentTheme);
        this.checkReactions();
    }

    async addToQueue() {
        const title = prompt("Search Media / Enter Title:");
        if (!title || !title.trim()) return;
        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Queue`, title.trim());
            if (!resp.ok) throw new Error("Queue add failed");
            await this.refreshRoom();
        } catch (e) {
            console.error("Queue Error:", e);
        }
    }

    async addTheory() {
        const text = prompt("Enter your theory / observation:");
        if (!text || !text.trim()) return;
        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Theories`, text.trim());
            if (!resp.ok) throw new Error("Theory add failed");
            await this.refreshRoom();
        } catch (e) {
            console.error("Theory Error:", e);
        }
    }

    renderQueue() {
        const dataStr = JSON.stringify(this.currentRoom.queue);
        if (dataStr === this._lastQueueData) return;
        this._lastQueueData = dataStr;

        const container = document.getElementById('queue-panel');
        this.clear(container);
        if (!this.currentRoom.queue.length) {
            container.appendChild(this.textEl('div', 'Queue is empty.', 'loading'));
            return;
        }

        this.currentRoom.queue.forEach(item => {
            const row = document.createElement('div');
            row.className = 'queue-item';
            row.appendChild(this.textEl('span', item.title));
            const addedBy = this.textEl('span', `Added by ${item.addedBy}`);
            addedBy.style.fontSize = '0.7rem';
            addedBy.style.color = 'var(--text-dim)';
            row.appendChild(addedBy);
            container.appendChild(row);
        });
    }

    renderTheories() {
        const dataStr = JSON.stringify(this.currentRoom.theories);
        if (dataStr === this._lastTheoryData) return;
        this._lastTheoryData = dataStr;

        const container = document.getElementById('theory-board');
        this.clear(container);
        const addBtn = this.button('+ New Theory', 'action-btn', () => this.addTheory());
        addBtn.style.height = '150px';
        addBtn.style.width = '150px';
        addBtn.style.flexShrink = '0';
        container.appendChild(addBtn);

        this.currentRoom.theories.forEach(note => {
            const noteEl = document.createElement('div');
            noteEl.className = 'sticky-note';
            noteEl.appendChild(this.textEl('strong', note.author));
            noteEl.appendChild(document.createElement('br'));
            noteEl.appendChild(document.createTextNode(note.text));
            container.appendChild(noteEl);
        });
    }

    renderCinemaSeats() {
        const dataStr = JSON.stringify(this.currentRoom.cinemaSeats);
        if (dataStr === this._lastCinemaData) return;
        this._lastCinemaData = dataStr;

        const container = document.getElementById('cinema-seats');
        this.clear(container);
        for (let i = 0; i < 40; i++) {
            const seat = document.createElement('div');
            seat.className = 'seat';
            const occupant = Object.entries(this.currentRoom.cinemaSeats).find(([, s]) => s === i);
            if (occupant) {
                seat.classList.add('occupied');
                seat.title = occupant[0];
            }
            container.appendChild(seat);
        }
    }

    async checkVR() {
        try {
            if (navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')) {
                document.getElementById('btn-vr-mode').style.display = 'block';
            }
        } catch { }

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
        btn.textContent = this.isVR ? "Exit VR" : "Enter VR";
        if (this.isVR && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
        else if (!this.isVR && document.exitFullscreen) document.exitFullscreen();
    }

    async saveDiscordStage() {
        const stageId = document.getElementById('discord-stage-id').value.trim();
        const botToken = document.getElementById('discord-bot-token').value.trim();
        if (!stageId || !botToken) return alert("Please enter both ID and Token.");

        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/DiscordStage`, { botToken, stageId });
            if (!resp.ok) throw new Error("Discord config failed");
            document.getElementById('discord-bot-token').value = '';
            alert("Discord Stage Configured!");
        } catch (e) {
            console.error("Discord Config Error:", e);
        }
    }

    async syncDiscordStage(titleOverride = null) {
        const title = titleOverride || prompt("Enter topic to sync to Discord:");
        if (!title || !title.trim()) return;
        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/SyncStage`, title.trim());
            if (!resp.ok) throw new Error("Discord sync failed");
        } catch (e) {
            console.error("Discord Sync Error:", e);
        }
    }

    async sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text || !this.currentRoom || !this.canChat()) return;
        input.value = '';
        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Messages`, text);
            if (!resp.ok) throw new Error("Send message failed");
            await this.refreshRoom();
        } catch (e) {
            console.error("Send Message Error:", e);
        }
    }

    async sendReaction(emoji) {
        if (!this.currentRoom) return;
        this.triggerReaction(emoji);
        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Reactions`, emoji);
            if (!resp.ok) throw new Error("Reaction failed");
        } catch (e) {
            console.error("Send Reaction Error:", e);
        }
    }

    triggerReaction(emoji) {
        const player = document.querySelector('.player-placeholder');
        if (!player) return;
        const el = document.createElement('div');
        el.className = 'floating-reaction';
        el.textContent = emoji;
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
            const resp = await fetch(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Updates?since=${encodeURIComponent(this.lastUpdate)}`);
            if (resp.status === 200) {
                this.currentRoom = await resp.json();
                this.lastUpdate = this.currentRoom.lastUpdated;
                this.updateUIState();
            } else if (resp.status === 403 || resp.status === 404) {
                this.stopRoomPolling();
                this.currentRoom = null;
                this.showView('lobby');
            }
        } catch (e) {
            console.error("Room Polling Error:", e);
        }
        if (this.isPolling) this.pollTimer = setTimeout(() => this.pollRoom(), 2000);
    }

    renderChat() {
        const container = document.getElementById('chat-messages');
        this.clear(container);
        this.currentRoom.messages.forEach(msg => {
            const bubble = document.createElement('div');
            bubble.className = `message ${msg.userName === this.currentUser ? 'sent' : 'received'}`;
            bubble.appendChild(this.textEl('span', msg.userName, 'user'));
            bubble.appendChild(document.createTextNode(msg.text));
            container.appendChild(bubble);
        });
        container.scrollTop = container.scrollHeight;
    }

    renderParticipants() {
        const dataStr = JSON.stringify(this.currentRoom.participants);
        if (dataStr === this._lastParticipantData) return;
        this._lastParticipantData = dataStr;

        const list = document.getElementById('participant-list');
        this.clear(list);
        this.currentRoom.participants.forEach(userId => {
            const item = document.createElement('div');
            item.className = 'participant-item';
            item.appendChild(this.textEl('span', userId, 'user-name'));

            if (this.currentRoom.ownerId === userId) {
                item.appendChild(this.textEl('span', 'Host', 'role-badge role-owner'));
            } else if (this.currentRoom.coHostIds.includes(userId)) {
                item.appendChild(this.textEl('span', 'Co-host', 'role-badge role-cohost'));
            }

            list.appendChild(item);
        });
    }

    renderPolls() {
        const container = document.getElementById('poll-list');
        this.clear(container);

        if (!this.currentRoom.activePolls.length) {
            container.appendChild(this.textEl('div', 'No polls.'));
            return;
        }

        this.currentRoom.activePolls.forEach(poll => {
            const card = document.createElement('div');
            card.className = 'poll-card';
            card.appendChild(this.textEl('div', poll.question, 'poll-question'));

            const totalVotes = Object.values(poll.votes || {}).reduce((sum, voters) => sum + voters.length, 0);
            poll.options.forEach(opt => {
                const voters = poll.votes?.[opt] || [];
                const pct = totalVotes ? Math.round((voters.length / totalVotes) * 100) : 0;
                const option = this.button(`${opt} (${voters.length})`, 'poll-option', () => this.votePoll(poll.id, opt));
                const progressBg = document.createElement('div');
                progressBg.className = 'poll-progress-bg';
                const progress = document.createElement('div');
                progress.className = 'poll-progress-fill';
                progress.style.width = `${pct}%`;
                progressBg.appendChild(progress);
                option.appendChild(progressBg);
                card.appendChild(option);
            });

            container.appendChild(card);
        });
    }

    async votePoll(pollId, option) {
        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Polls/${encodeURIComponent(pollId)}/Vote`, option);
            if (!resp.ok) throw new Error("Vote failed");
            await this.refreshRoom();
        } catch (e) {
            console.error("Poll Vote Error:", e);
        }
    }

    async showPollModal() {
        const question = prompt("Poll question:");
        if (!question || !question.trim()) return;
        const rawOptions = prompt("Options, separated by commas:");
        const options = (rawOptions || '').split(',').map(o => o.trim()).filter(Boolean);
        if (options.length < 2) return alert("Enter at least two options.");

        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Polls`, { question: question.trim(), options });
            if (!resp.ok) throw new Error("Poll create failed");
            await this.refreshRoom();
        } catch (e) {
            console.error("Poll Create Error:", e);
        }
    }

    applyTheme(theme) {
        const allowed = ['default', 'cinema', 'horror', 'anime', 'scifi', 'cyberpunk'];
        const next = allowed.includes(theme) ? theme : 'default';
        document.body.className = next === 'default' ? '' : `theme-${next}`;
    }

    showView(view) {
        document.getElementById('lobby-view').style.display = view === 'lobby' ? 'block' : 'none';
        document.getElementById('party-view').style.display = view === 'party' ? 'block' : 'none';
        if (view === 'lobby') document.getElementById('participant-section').style.display = 'none';
    }

    startLobbyPolling() {
        setInterval(() => { if (!this.currentRoom) this.loadRooms(); }, 5000);
    }

    startRoomPolling() {
        if (this.isPolling) return;
        this.isPolling = true;
        this.pollRoom();
    }

    stopRoomPolling() {
        this.isPolling = false;
        if (this.pollTimer) clearTimeout(this.pollTimer);
        this.pollTimer = null;
    }

    canManage() {
        return this.isOwner() || (this.currentRoom && this.currentRoom.coHostIds.includes(this.currentUser));
    }

    isOwner() {
        return this.currentRoom && this.currentRoom.ownerId === this.currentUser;
    }

    canChat() {
        if (!this.currentRoom) return false;
        if (this.canManage()) return true;
        const perms = this.currentRoom.permissions?.[this.currentUser];
        return !perms || perms.canChat !== false;
    }

    async generateAdvancedInvite() {
        const canChat = confirm("Allow chat for this invite?");
        const canControl = confirm("Allow playback control for this invite?");
        const hours = parseInt(prompt("Hours valid (0 for no expiration):", "24") || "24", 10);
        try {
            const resp = await this.fetchJson(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Invitations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ canChat, canControl, hoursValid: Number.isNaN(hours) ? 24 : hours, maxUses: 0 })
            });
            this.showInviteLink(resp.code);
        } catch (e) {
            console.error("Invite Gen Error:", e);
        }
    }

    showInviteLink(code) {
        const url = new URL(window.location.href);
        url.searchParams.set('code', code);
        const link = url.toString();
        const qrContainer = document.getElementById('qr-container');
        if (qrContainer) {
            this.clear(qrContainer);
            const img = document.createElement('img');
            img.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(link)}&color=4a00e0`;
            img.alt = 'Invite QR code';
            img.style.width = '100%';
            qrContainer.appendChild(img);
        }
        document.getElementById('share-link-text').value = link;
        document.getElementById('invite-code-text').textContent = code;
    }

    showShareModal() {
        if (!this.currentRoom) return;
        this.showInviteLink(this.currentRoom.roomCode);
        document.getElementById('share-modal').style.display = 'block';
        document.getElementById('modal-overlay').style.display = 'block';
    }

    hideShareModal() {
        document.getElementById('share-modal').style.display = 'none';
        document.getElementById('modal-overlay').style.display = 'none';
    }

    async copyShareLink() {
        await navigator.clipboard.writeText(document.getElementById('share-link-text').value);
    }

    async copyInvite() {
        await navigator.clipboard.writeText(document.getElementById('invite-code-text').textContent);
    }
}

const app = new JellTogetherApp();
window.app = app;
window.showPollModal = () => app.showPollModal();
