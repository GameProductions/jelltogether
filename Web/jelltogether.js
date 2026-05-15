class JellTogetherApp {
    constructor() {
        this.publicJellyfinUrl = "";
        this.publicCompanionOrigin = "";
        this.canSavePublicAccessSettings = false;
        this.enabledLibraryIds = [];
        this.allowQueueVotingByDefault = true;
        this.allowParticipantQueueAdds = true;
        this.currentRoom = null;
        this.currentUser = "Unknown";
        this.currentJellyfinMediaUserId = "";
        this.lastUpdate = new Date(0).toISOString();
        this.isPolling = false;
        this.pollTimer = null;
        this.reactionCount = 0;
        this.isVR = false;
        this.lang = 'en';
        this.t = JELL_TOGETHER_I18N[this.lang];
        this.activeSidebarTab = 'chat';
        this.replyTarget = null;
        this.authPromptShown = false;

        this._lastCinemaData = null;
        this._lastParticipantData = null;
        this._lastPendingData = null;
        this._lastQueueData = null;
        this._lastTheoryData = null;
        this.activeToasts = new Set();

        this.init();
    }

    async init() {
        const inviteCode = this.getInviteCodeFromUrl();
        await this.loadSettings();
        await this.loadCurrentUser();
        await this.loadRooms();
        this.startLobbyPolling();
        this.checkVR();
        this.createStars();
        this.setupEventHandlers();
        if (inviteCode) this.joinByCode(inviteCode);
    }

    getInviteCodeFromUrl() {
        if (window.JELL_TOGETHER_INVITE_CODE) return window.JELL_TOGETHER_INVITE_CODE;

        const params = new URLSearchParams(window.location.search);
        const directCode = params.get('code');
        if (directCode) return directCode;

        const hashQuery = window.location.hash.includes('?')
            ? window.location.hash.substring(window.location.hash.indexOf('?') + 1)
            : '';
        return new URLSearchParams(hashQuery).get('code');
    }

    companionUrl(code = null) {
        const base = this.publicCompanionOrigin ||
            (this.publicJellyfinUrl ? `${this.publicJellyfinUrl.replace(/\/+$/, '')}/jelltogether/Companion` : `${window.location.origin}/jelltogether/Companion`);
        return this.addInviteCode(base, code);
    }

    addInviteCode(url, code = null) {
        if (!code) return url;
        const next = new URL(url, window.location.origin);
        next.searchParams.set('code', code);
        return next.toString();
    }

    async loadSettings() {
        try {
            const settings = await this.fetchJson('/jelltogether/Settings');
            this.publicJellyfinUrl = settings.publicJellyfinUrl || "";
            this.publicCompanionOrigin = settings.publicCompanionUrl || "";
            this.enabledLibraryIds = settings.enabledLibraryIds || [];
            this.allowQueueVotingByDefault = settings.allowQueueVotingByDefault !== false;
            this.allowParticipantQueueAdds = settings.allowParticipantQueueAdds !== false;
            this.canSavePublicAccessSettings = settings.canSavePublicAccessSettings === true;
        } catch (e) {
            console.error("Settings Load Error:", e);
            this.showToast("Sign in to Jellyfin to load JellTogether settings.", 'error');
        }

        const publicAccessSettings = document.getElementById('public-access-settings');
        const jellyfinInput = document.getElementById('public-jellyfin-url');
        const companionInput = document.getElementById('public-companion-url');
        if (publicAccessSettings) publicAccessSettings.style.display = this.canSavePublicAccessSettings ? 'grid' : 'none';
        if (jellyfinInput) jellyfinInput.value = this.publicJellyfinUrl;
        if (companionInput) companionInput.value = this.publicCompanionOrigin || this.generatedCompanionUrl();
        this.updateCompanionPills();
    }

    setupEventHandlers() {
        const chatInput = document.getElementById('chat-input');
        const codeInput = document.getElementById('join-code-input');
        const jellyfinInput = document.getElementById('public-jellyfin-url');
        const companionInput = document.getElementById('public-companion-url');
        const roomNameInput = document.getElementById('current-room-name');
        if (chatInput) chatInput.onkeypress = (e) => { if (e.key === 'Enter') this.sendMessage(); };
        if (codeInput) codeInput.onkeypress = (e) => { if (e.key === 'Enter') this.joinByCode(); };
        if (roomNameInput) {
            roomNameInput.addEventListener('blur', () => this.commitInlineRoomName());
            roomNameInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    roomNameInput.blur();
                }

                if (event.key === 'Escape') {
                    event.preventDefault();
                    roomNameInput.value = this.currentRoom?.name || '';
                    roomNameInput.blur();
                }
            });
        }
        if (jellyfinInput && companionInput) {
            jellyfinInput.addEventListener('input', () => {
                const generated = this.generatedCompanionUrl(jellyfinInput.value);
                companionInput.value = generated;
                this.updateCompanionPills(generated);
            });
        }
    }

    generatedCompanionUrl(value = this.publicJellyfinUrl) {
        const base = (value || "").trim().replace(/\/+$/, '');
        return base ? `${base}/jelltogether/Companion` : "";
    }

    updateCompanionPills(value = null) {
        const link = value || this.companionUrl();
        const label = link || 'Set a public Jellyfin URL';
        const settingsPill = document.getElementById('public-companion-pill');
        const sharePill = document.getElementById('public-companion-link-text');
        if (settingsPill) settingsPill.textContent = label;
        if (sharePill) sharePill.textContent = label;
    }

    async loadCurrentUser() {
        try {
            const user = await this.fetchJson('/jelltogether/CurrentUser');
            this.currentUser = user.id || user.name || "Unknown";
            this.currentJellyfinMediaUserId = user.mediaUserId || user.mediaUserID || "";
        } catch (e) {
            console.error("User Load Error:", e);
            this.showToast("Sign in to Jellyfin to use the companion.", 'error');
        }

        const display = document.getElementById('display-name');
        if (display) display.textContent = this.currentUser;
    }

    async fetchJson(url, options = {}) {
        const resp = await this.request(url, options);
        if (!resp.ok) throw new Error(`${options.method || 'GET'} ${url} failed with ${resp.status}`);
        if (resp.status === 204) return null;
        return resp.json();
    }

    async request(url, options = {}) {
        const headers = new Headers(options.headers || {});
        const token = this.getAccessToken();
        if (token && !headers.has('X-Emby-Token')) {
            headers.set('X-Emby-Token', token);
        }
        const response = await fetch(url, {
            ...options,
            headers,
            credentials: 'same-origin'
        });
        if (response.status === 401) this.showSignInPrompt();
        return response;
    }

    getAccessToken() {
        const apiClient = window.ApiClient;
        const candidates = [
            typeof apiClient?.accessToken === 'function' ? apiClient.accessToken() : apiClient?.accessToken,
            typeof apiClient?.getAccessToken === 'function' ? apiClient.getAccessToken() : null,
            apiClient?._serverInfo?.AccessToken,
            apiClient?._serverInfo?.AccessToken || apiClient?.serverInfo?.AccessToken
        ];

        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
        }

        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = key ? localStorage.getItem(key) : null;
                if (!value || !value.includes('AccessToken')) continue;

                const parsed = JSON.parse(value);
                const token = this.findAccessToken(parsed);
                if (token) return token;
            }
        } catch (e) {
            console.error("Access token lookup failed:", e);
        }

        return "";
    }

    findAccessToken(value) {
        if (!value || typeof value !== 'object') return "";
        if (typeof value.AccessToken === 'string' && value.AccessToken.trim()) return value.AccessToken.trim();
        if (typeof value.accessToken === 'string' && value.accessToken.trim()) return value.accessToken.trim();

        for (const child of Object.values(value)) {
            const token = this.findAccessToken(child);
            if (token) return token;
        }

        return "";
    }

    showSignInPrompt() {
        if (this.authPromptShown) return;
        this.authPromptShown = true;
        this.showToast("Sign in to Jellyfin to use JellTogether.", 'error');

        const overlay = document.createElement('div');
        overlay.id = 'app-modal-overlay';
        overlay.className = 'app-modal-overlay';
        const modal = document.createElement('div');
        modal.id = 'app-modal';
        modal.className = 'app-modal glass-card';
        modal.appendChild(this.textEl('h3', 'Sign in required'));
        modal.appendChild(this.textEl('p', 'Open Jellyfin, sign in, then return to this companion link.', 'modal-subtitle'));
        const actionRow = document.createElement('div');
        actionRow.className = 'split-actions';
        actionRow.appendChild(this.button('Open Jellyfin Sign In', 'primary-command', () => this.openJellyfinSignIn()));
        actionRow.appendChild(this.button('Dismiss', 'secondary-command', () => this.hideModal()));
        modal.appendChild(actionRow);
        overlay.onclick = (event) => { if (event.target === overlay) this.hideModal(); };
        overlay.appendChild(modal);
        this.hideModal();
        document.body.appendChild(overlay);
    }

    openJellyfinSignIn() {
        const returnUrl = window.location.href;
        window.location.href = `${window.location.origin}/web/index.html?returnUrl=${encodeURIComponent(returnUrl)}`;
    }

    jsonPost(url, value) {
        return this.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(value)
        });
    }

    resetRenderCaches() {
        this._lastCinemaData = null;
        this._lastParticipantData = null;
        this._lastPendingData = null;
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

    prop(source, camelName, pascalName = null, fallback = undefined) {
        if (!source || typeof source !== 'object') return fallback;
        if (source[camelName] !== undefined) return source[camelName];
        const nextPascal = pascalName || `${camelName.charAt(0).toUpperCase()}${camelName.slice(1)}`;
        return source[nextPascal] !== undefined ? source[nextPascal] : fallback;
    }

    normalizeQueueItem(item) {
        return {
            ...item,
            id: this.prop(item, 'id', null, ''),
            title: this.prop(item, 'title', null, 'Untitled item'),
            mediaId: this.prop(item, 'mediaId', null, ''),
            libraryId: this.prop(item, 'libraryId', null, ''),
            upvotes: this.prop(item, 'upvotes', null, []),
            mediaType: this.prop(item, 'mediaType', null, ''),
            overview: this.prop(item, 'overview', null, ''),
            addedBy: this.prop(item, 'addedBy', null, 'Unknown')
        };
    }

    normalizeTheory(note) {
        return {
            ...note,
            id: this.prop(note, 'id', null, ''),
            text: this.prop(note, 'text', null, ''),
            author: this.prop(note, 'author', null, 'Unknown'),
            createdAt: this.prop(note, 'createdAt', null, '')
        };
    }

    normalizeMessage(message) {
        return {
            ...message,
            id: this.prop(message, 'id', null, ''),
            userId: this.prop(message, 'userId', null, ''),
            userName: this.prop(message, 'userName', null, 'Unknown'),
            text: this.prop(message, 'text', null, ''),
            replyToMessageId: this.prop(message, 'replyToMessageId', null, ''),
            replyToUserName: this.prop(message, 'replyToUserName', null, ''),
            replyToText: this.prop(message, 'replyToText', null, ''),
            mentions: this.prop(message, 'mentions', null, []),
            reactions: this.prop(message, 'reactions', null, {}),
            timestamp: this.prop(message, 'timestamp', null, '')
        };
    }

    normalizeInvite(invite) {
        return {
            ...invite,
            code: this.prop(invite, 'code', null, ''),
            createdBy: this.prop(invite, 'createdBy', null, ''),
            currentUses: this.prop(invite, 'currentUses', null, 0),
            maxUses: this.prop(invite, 'maxUses', null, 0),
            expiresAt: this.prop(invite, 'expiresAt', null, null)
        };
    }

    normalizeRoom(room) {
        if (!room || typeof room !== 'object') return null;

        const activePolls = this.prop(room, 'activePolls', null, []).map(poll => ({
            id: this.prop(poll, 'id', null, ''),
            question: this.prop(poll, 'question', null, ''),
            options: this.prop(poll, 'options', null, []),
            votes: this.prop(poll, 'votes', null, {}),
            isClosed: this.prop(poll, 'isClosed', null, false)
        }));

        return {
            ...room,
            id: this.prop(room, 'id', null, ''),
            name: this.prop(room, 'name', null, 'Untitled Party'),
            roomCode: this.prop(room, 'roomCode', null, ''),
            ownerId: this.prop(room, 'ownerId', null, ''),
            participants: this.prop(room, 'participants', null, []),
            coHostIds: this.prop(room, 'coHostIds', null, []),
            permissions: this.prop(room, 'permissions', null, {}),
            queue: this.prop(room, 'queue', null, []).map(item => this.normalizeQueueItem(item)),
            theories: this.prop(room, 'theories', null, []).map(note => this.normalizeTheory(note)),
            messages: this.prop(room, 'messages', null, []).map(message => this.normalizeMessage(message)),
            invitations: this.prop(room, 'invitations', null, []).map(invite => this.normalizeInvite(invite)),
            recentReactions: this.prop(room, 'recentReactions', null, []),
            activePolls,
            cinemaSeats: this.prop(room, 'cinemaSeats', null, {}),
            currentTheme: this.prop(room, 'currentTheme', null, 'default'),
            isPrivate: this.prop(room, 'isPrivate', null, false),
            isHostOnlyControl: this.prop(room, 'isHostOnlyControl', null, false),
            allowParticipantInvites: this.prop(room, 'allowParticipantInvites', null, true),
            allowQueueVoting: this.prop(room, 'allowQueueVoting', null, true),
            requireJoinApproval: this.prop(room, 'requireJoinApproval', null, false),
            isJoinLocked: this.prop(room, 'isJoinLocked', null, false),
            pendingParticipantIds: this.prop(room, 'pendingParticipantIds', null, []),
            bannedParticipantIds: this.prop(room, 'bannedParticipantIds', null, []),
            nowPlayingTitle: this.prop(room, 'nowPlayingTitle', null, ''),
            nowPlayingMediaId: this.prop(room, 'nowPlayingMediaId', null, ''),
            nowPlayingStartedAt: this.prop(room, 'nowPlayingStartedAt', null, null),
            lastUpdated: this.prop(room, 'lastUpdated', null, new Date(0).toISOString()),
            stats: this.prop(room, 'stats', null, {})
        };
    }

    showToast(message, tone = 'info') {
        const key = `${tone}:${message}`;
        if (this.activeToasts.has(key)) return;
        this.activeToasts.add(key);

        let stack = document.getElementById('toast-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'toast-stack';
            document.body.appendChild(stack);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${tone}`;
        toast.textContent = message;
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.textContent = 'Dismiss';
        dismiss.onclick = () => {
            this.activeToasts.delete(key);
            toast.remove();
        };
        toast.appendChild(dismiss);
        stack.appendChild(toast);
        setTimeout(() => {
            this.activeToasts.delete(key);
            toast.remove();
        }, 5200);
    }

    showModal(title, fields, actions) {
        this.hideModal();

        const overlay = document.createElement('div');
        overlay.id = 'app-modal-overlay';
        overlay.className = 'app-modal-overlay';
        const modal = document.createElement('div');
        modal.id = 'app-modal';
        modal.className = 'app-modal glass-card';
        modal.appendChild(this.textEl('h3', title));

        const values = {};
        fields.forEach(field => {
            const label = document.createElement('label');
            label.className = field.type === 'checkbox' ? 'toggle-row modal-field' : 'modal-field';
            const input = document.createElement('input');
            input.type = field.type || 'text';
            input.className = field.type === 'checkbox' ? '' : 'glass-input';
            input.value = field.value || '';
            input.checked = field.checked === true;
            input.placeholder = field.placeholder || '';
            input.min = field.min ?? '';
            values[field.id] = input;
            label.appendChild(input);
            label.appendChild(this.textEl('span', field.label));
            modal.appendChild(label);
        });

        const actionRow = document.createElement('div');
        actionRow.className = 'split-actions';
        actions.forEach(action => {
            const className = action.danger ? 'danger-command' : (action.primary ? 'primary-command' : 'secondary-command');
            actionRow.appendChild(this.button(action.label, className, () => {
                const result = {};
                Object.entries(values).forEach(([id, input]) => {
                    result[id] = input.type === 'checkbox' ? input.checked : input.value;
                });
                this.hideModal();
                action.onClick?.(result);
            }));
        });
        actionRow.appendChild(this.button('Cancel', 'secondary-command', () => this.hideModal()));
        modal.appendChild(actionRow);
        overlay.onclick = (event) => { if (event.target === overlay) this.hideModal(); };
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        modal.querySelector('input')?.focus();
    }

    hideModal() {
        document.getElementById('app-modal-overlay')?.remove();
    }

    async createRoom() {
        this.showModal('Create watch party', [
            { id: 'name', label: 'Room name', placeholder: 'Movie night' }
        ], [
            { label: 'Create', primary: true, onClick: ({ name }) => this.createRoomWithName(name) }
        ]);
    }

    async createRoomWithName(name) {
        if (!name || !name.trim()) return;
        try {
            const room = this.normalizeRoom(await this.fetchJson('/jelltogether/Rooms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(name.trim())
            }));
            if (!room?.id) throw new Error("Created room response did not include an id.");
            await this.joinRoom(room.id);
        } catch (e) {
            console.error("Create Room Error:", e);
            this.showToast("Failed to create room.", 'error');
        }
    }

    async loadRooms() {
        try {
            const rooms = (await this.fetchJson('/jelltogether/Rooms'))
                .map(room => this.normalizeRoom(room))
                .filter(room => room?.id);
            this.renderRoomGrid(rooms);
        } catch (e) {
            console.error("Lobby Load Error:", e);
            this.showToast("Could not load watch parties. Sign in to Jellyfin and try again.", 'error');
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
            if (!room?.id) return;

            const card = document.createElement('div');
            card.className = 'room-card';
            card.onclick = () => this.joinRoom(room.id);

            card.appendChild(this.textEl('h3', room.name || 'Untitled Party'));
            const meta = document.createElement('div');
            meta.className = 'meta';
            meta.appendChild(this.textEl('span', `Participants: ${room.participants?.length || 0}`));
            card.appendChild(meta);

            const nowPlaying = this.roomNowPlayingDetails(room);
            const nowPlayingEl = document.createElement('div');
            nowPlayingEl.className = nowPlaying.title ? 'room-now-playing is-active' : 'room-now-playing';
            nowPlayingEl.appendChild(this.textEl('span', nowPlaying.title ? 'Now playing' : 'Not started yet', 'room-now-label'));
            nowPlayingEl.appendChild(this.textEl('strong', nowPlaying.title || 'Queue waiting'));
            if (nowPlaying.meta) nowPlayingEl.appendChild(this.textEl('em', nowPlaying.meta));
            if (nowPlaying.overview) nowPlayingEl.appendChild(this.textEl('p', nowPlaying.overview));
            card.appendChild(nowPlayingEl);

            card.appendChild(this.button(this.t.join_btn, 'btn-join', (e) => {
                e.stopPropagation();
                this.joinRoom(room.id);
            }));
            grid.appendChild(card);
        });
    }

    roomNowPlayingDetails(room) {
        const activeItem = room.queue?.find(item => item.mediaId && item.mediaId === room.nowPlayingMediaId);
        const title = room.nowPlayingTitle || activeItem?.title || '';
        const meta = [
            activeItem?.mediaType,
            room.nowPlayingStartedAt ? `Started ${this.relativeTime(room.nowPlayingStartedAt)}` : ''
        ].filter(Boolean).join(' • ');

        return {
            title,
            meta,
            overview: activeItem?.overview || ''
        };
    }

    relativeTime(value) {
        const then = new Date(value).getTime();
        if (!Number.isFinite(then)) return '';
        const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
        if (seconds < 60) return 'just now';
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) return `${minutes} min ago`;
        const hours = Math.round(minutes / 60);
        return `${hours} hr ago`;
    }

    async joinRoom(roomId, inviteCode = null) {
        if (!roomId) {
            this.showToast("This room is missing an id. Refresh the page and try again.", 'error');
            return;
        }

        try {
            const url = `/jelltogether/Rooms/${encodeURIComponent(roomId)}/Join${inviteCode ? `?code=${encodeURIComponent(inviteCode)}` : ''}`;
            const joinResp = await this.request(url, { method: 'POST' });
            if (!joinResp.ok) throw new Error("Join failed");

            this.currentRoom = this.normalizeRoom(await this.fetchJson(`/jelltogether/Rooms/${encodeURIComponent(roomId)}`));
            if (!this.currentRoom?.id) throw new Error("Room response did not include an id.");
            this.lastUpdate = this.currentRoom.lastUpdated || new Date(0).toISOString();
            this.reactionCount = this.currentRoom.recentReactions?.length || 0;
            this.resetRenderCaches();
            this.showView('party');
            this.showSidebarTab(this.activeSidebarTab || 'chat');
            this.startRoomPolling();
            this.updateUIState();
        } catch (e) {
            console.error("Join Error:", e);
            this.showToast("Failed to join room.", 'error');
        }
    }

    async joinByCode(codeOverride = null) {
        const code = (codeOverride || document.getElementById('join-code-input').value).trim().toUpperCase();
        if (!code) return;

        try {
            const resp = await this.request(`/jelltogether/Rooms/ByCode/${encodeURIComponent(code)}`);
            if (resp.status === 404) {
                this.showToast("Invalid invite code.", 'error');
                return;
            }
            if (!resp.ok) throw new Error("Code lookup failed");
            const room = this.normalizeRoom(await resp.json());
            if (!room?.id) throw new Error("Invite lookup response did not include an id.");
            this.joinRoom(room.id, code);
        } catch (e) {
            console.error("Code Join Error:", e);
            this.showToast("Failed to join by code.", 'error');
        }
    }

    async leaveRoom() {
        if (!this.currentRoom) return;
        try {
            await this.request(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Leave`, { method: 'POST' });
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

    async toggleQueueVoting() {
        await this.postRoomAction('ToggleQueueVoting');
    }

    async toggleJoinApproval() {
        await this.postRoomAction('ToggleJoinApproval');
    }

    async toggleJoinLock() {
        await this.postRoomAction('ToggleJoinLock');
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
            const resp = await this.request(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/${action}`, { method: 'POST' });
            if (!resp.ok) throw new Error(`${action} failed`);
            await this.refreshRoom();
        } catch (e) {
            console.error(`${action} Error:`, e);
        }
    }

    async refreshRoom() {
        if (!this.currentRoom) return;
        this.currentRoom = this.normalizeRoom(await this.fetchJson(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}`));
        this.lastUpdate = this.currentRoom.lastUpdated || this.lastUpdate;
        this.updateUIState();
    }

    updateUIState() {
        if (!this.currentRoom) return;

        const amAdmin = this.canManage();
        const amOwner = this.isOwner();

        document.getElementById('sidebar-tabs').style.display = 'grid';
        document.getElementById('participant-section').style.display = 'block';
        document.getElementById('poll-section').style.display = 'block';
        document.getElementById('reaction-bar').style.display = 'flex';
        document.getElementById('chat-container').style.display = 'flex';
        document.getElementById('btn-new-poll').style.display = amAdmin ? 'flex' : 'none';

        const roomManagement = document.getElementById('room-management');
        if (roomManagement) roomManagement.style.display = amAdmin ? 'grid' : 'none';

        const themeControls = document.getElementById('host-theme-controls');
        if (themeControls) themeControls.style.display = amAdmin ? 'grid' : 'none';

        const discordControls = document.getElementById('host-discord-stage');
        if (discordControls) discordControls.style.display = amOwner ? 'grid' : 'none';

        const canInvite = amAdmin || this.currentRoom.allowParticipantInvites;
        const inviteContainer = document.getElementById('invite-code-container');
        if (inviteContainer) inviteContainer.style.display = canInvite ? 'flex' : 'none';

        const inviteToggleBtn = document.getElementById('btn-toggle-participant-invites');
        if (inviteToggleBtn) {
            inviteToggleBtn.style.display = amOwner ? 'inline-flex' : 'none';
            inviteToggleBtn.textContent = this.currentRoom.allowParticipantInvites ? 'Invites on' : 'Invites off';
            inviteToggleBtn.classList.toggle('active', this.currentRoom.allowParticipantInvites);
            inviteToggleBtn.classList.toggle('warning', !this.currentRoom.allowParticipantInvites);
        }

        const privacyBtn = document.getElementById('btn-toggle-privacy');
        if (privacyBtn) {
            privacyBtn.style.display = amOwner ? 'inline-flex' : 'none';
            privacyBtn.textContent = this.currentRoom.isPrivate ? 'Private' : 'Public';
            privacyBtn.classList.toggle('active', !this.currentRoom.isPrivate);
            privacyBtn.classList.toggle('warning', this.currentRoom.isPrivate);
        }

        const controlBtn = document.getElementById('btn-toggle-control');
        if (controlBtn) {
            controlBtn.style.display = amOwner ? 'inline-flex' : 'none';
            controlBtn.textContent = this.currentRoom.isHostOnlyControl ? 'Host control' : 'Open control';
            controlBtn.classList.toggle('active', !this.currentRoom.isHostOnlyControl);
            controlBtn.classList.toggle('warning', this.currentRoom.isHostOnlyControl);
        }

        const approvalBtn = document.getElementById('btn-toggle-join-approval');
        if (approvalBtn) {
            approvalBtn.style.display = this.canManageParticipants() ? 'inline-flex' : 'none';
            approvalBtn.textContent = this.currentRoom.requireJoinApproval ? 'Approval on' : 'Approval off';
            approvalBtn.classList.toggle('active', this.currentRoom.requireJoinApproval);
        }

        const lockBtn = document.getElementById('btn-toggle-join-lock');
        if (lockBtn) {
            lockBtn.style.display = this.canManageParticipants() ? 'inline-flex' : 'none';
            lockBtn.textContent = this.currentRoom.isJoinLocked ? 'Locked' : 'Join open';
            lockBtn.classList.toggle('warning', this.currentRoom.isJoinLocked);
        }

        const queueVotingBtn = document.getElementById('btn-toggle-queue-voting');
        if (queueVotingBtn) {
            queueVotingBtn.style.display = amOwner ? 'inline-flex' : 'none';
            queueVotingBtn.textContent = this.currentRoom.allowQueueVoting ? 'Voting on' : 'Voting off';
        }

        document.getElementById('participant-count').textContent = `${this.currentRoom.participants.length} participants`;
        const roomNameInput = document.getElementById('current-room-name');
        if (roomNameInput && document.activeElement !== roomNameInput) roomNameInput.value = this.currentRoom.name;
        if (roomNameInput) {
            roomNameInput.readOnly = !amAdmin;
            roomNameInput.classList.toggle('is-editable', amAdmin);
            roomNameInput.title = amAdmin ? 'Edit room name' : 'Only hosts can rename rooms';
        }
        document.getElementById('invite-code-text').textContent = this.currentRoom.roomCode;

        const canChat = this.canChat();
        document.getElementById('chat-input').disabled = !canChat;
        document.getElementById('btn-send').disabled = !canChat;
        const addQueueBtn = document.getElementById('btn-add-queue');
        if (addQueueBtn) addQueueBtn.disabled = !this.canAddQueue();

        this.renderPlayerState();
        this.renderParticipants();
        this.renderPendingParticipants();
        this.renderPolls();
        this.renderChat();
        this.renderQueue();
        this.renderTheories();
        this.renderCinemaSeats();
        if (!this.isVR) this.applyTheme(this.currentRoom.currentTheme);
        this.checkReactions();
    }

    showSidebarTab(tabName) {
        const tabs = ['chat', 'room', 'people', 'polls'];
        const nextTab = tabs.includes(tabName) ? tabName : 'chat';
        this.activeSidebarTab = nextTab;

        document.querySelectorAll('.sidebar-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === nextTab);
        });

        document.querySelectorAll('.sidebar-tab-panel').forEach(panel => {
            panel.hidden = panel.dataset.tabPanel !== nextTab;
        });
    }

    async addToQueue() {
        this.showQueueSearchModal();
    }

    showQueueSearchModal() {
        this.hideModal();

        const overlay = document.createElement('div');
        overlay.id = 'app-modal-overlay';
        overlay.className = 'app-modal-overlay';
        const modal = document.createElement('div');
        modal.id = 'app-modal';
        modal.className = 'app-modal glass-card queue-search-modal';
        modal.appendChild(this.textEl('h3', 'Add from Jellyfin'));

        const input = document.createElement('input');
        input.type = 'search';
        input.className = 'glass-input';
        input.placeholder = 'Search movies and episodes';
        modal.appendChild(input);

        const results = document.createElement('div');
        results.className = 'media-search-results';
        results.appendChild(this.textEl('div', 'Start typing to search allowed libraries.', 'loading'));
        modal.appendChild(results);

        const actionRow = document.createElement('div');
        actionRow.className = 'split-actions';
        actionRow.appendChild(this.button('Close', 'secondary-command', () => this.hideModal()));
        modal.appendChild(actionRow);

        let searchTimer = null;
        input.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => this.searchQueueMedia(input.value, results), 260);
        });

        overlay.onclick = (event) => { if (event.target === overlay) this.hideModal(); };
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        input.focus();
    }

    async searchQueueMedia(query, container) {
        const term = query.trim();
        this.clear(container);
        if (term.length < 2) {
            container.appendChild(this.textEl('div', 'Start typing to search allowed libraries.', 'loading'));
            return;
        }

        try {
            const libraries = this.enabledLibraryIds.length ? this.enabledLibraryIds : [''];
            const searches = libraries.map(libraryId => this.searchLibrary(term, libraryId));
            const grouped = await Promise.all(searches);
            const seen = new Set();
            const results = grouped.flat().filter(item => {
                const key = item.mediaId || `${item.title}-${item.mediaType}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            }).slice(0, 24);
            if (!results.length) {
                container.appendChild(this.textEl('div', 'No matching media found.', 'loading'));
                return;
            }

            results.forEach(item => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'media-result';
                button.appendChild(this.textEl('strong', item.title));
                button.appendChild(this.textEl('span', [item.mediaType, item.year].filter(Boolean).join(' • ') || 'Jellyfin item'));
                if (item.overview) button.appendChild(this.textEl('span', item.overview));
                button.onclick = () => this.showQueueAddOptions(item);
                container.appendChild(button);
            });
        } catch (e) {
            console.error('Media Search Error:', e);
            container.appendChild(this.textEl('div', 'Search failed.', 'loading'));
        }
    }

    async searchLibrary(term, libraryId) {
        const userId = this.currentJellyfinUserId();
        if (!userId) return [];
        const params = new URLSearchParams({
            Recursive: 'true',
            SearchTerm: term,
            IncludeItemTypes: 'Movie,Episode,Series,Season,BoxSet',
            Limit: '12',
            Fields: 'Overview,ParentId'
        });
        if (libraryId) params.set('ParentId', libraryId);

        const data = await this.fetchJson(`/Users/${encodeURIComponent(userId)}/Items?${params}`);
        const items = data.Items || data.items || [];
        return items.map(item => ({
            title: this.mediaTitle(item),
            mediaId: item.Id || item.id || '',
            libraryId,
            mediaType: item.Type || item.type || item.MediaType || item.mediaType || '',
            overview: item.Overview || item.overview || '',
            year: item.ProductionYear || item.productionYear || '',
            seriesId: item.SeriesId || item.seriesId || '',
            seriesName: item.SeriesName || item.seriesName || '',
            seasonId: item.SeasonId || item.seasonId || '',
            seasonName: item.SeasonName || item.seasonName || '',
            parentId: item.ParentId || item.parentId || ''
        })).filter(item => item.mediaId && item.title);
    }

    mediaTitle(item) {
        const name = item.Name || item.name || 'Untitled';
        const series = item.SeriesName || item.seriesName;
        const season = item.ParentIndexNumber || item.parentIndexNumber;
        const episode = item.IndexNumber || item.indexNumber;
        if (series && (season || episode)) {
            const code = `S${String(season || 0).padStart(2, '0')}E${String(episode || 0).padStart(2, '0')}`;
            return `${series} ${code} - ${name}`;
        }
        return name;
    }

    async showQueueAddOptions(item) {
        const modal = document.getElementById('app-modal');
        if (!modal || !item?.mediaId) {
            await this.addMediaToQueue(item);
            return;
        }

        this.clear(modal);
        modal.className = 'app-modal glass-card queue-search-modal';
        modal.appendChild(this.textEl('h3', 'Add to Queue'));
        modal.appendChild(this.textEl('p', item.title, 'modal-subtitle'));

        const options = document.createElement('div');
        options.className = 'queue-add-options';
        options.appendChild(this.button('Add this item', 'primary-command', () => this.addMediaToQueue(item)));
        options.appendChild(this.textEl('div', 'Looking for seasons, series, and collections...', 'loading'));
        modal.appendChild(options);

        const actionRow = document.createElement('div');
        actionRow.className = 'split-actions';
        actionRow.appendChild(this.button('Back to search', 'secondary-command', () => this.showQueueSearchModal()));
        actionRow.appendChild(this.button('Close', 'secondary-command', () => this.hideModal()));
        modal.appendChild(actionRow);

        const groupOptions = await this.queueGroupOptions(item);
        const loading = options.querySelector('.loading');
        if (loading) loading.remove();

        if (!groupOptions.length) {
            options.appendChild(this.textEl('div', 'No larger season, series, or collection was found for this item.', 'loading'));
            return;
        }

        groupOptions.forEach(option => {
            const label = `${option.label} (${option.items.length})`;
            options.appendChild(this.button(label, 'secondary-command', () => this.addMediaGroupToQueue(option.items, option.successMessage)));
        });
    }

    async queueGroupOptions(item) {
        const options = [];
        const addOption = async (key, label, parentId, includeTypes, successMessage) => {
            if (!parentId || options.some(option => option.key === key)) return;
            const items = await this.fetchQueueGroupItems(parentId, includeTypes, item.libraryId);
            const filtered = items.filter(groupItem => groupItem.mediaId !== item.mediaId);
            if (filtered.length) options.push({ key, label, items, successMessage });
        };

        const type = String(item.mediaType || '').toLowerCase();
        if (type === 'episode') {
            await addOption(`season-${item.seasonId || item.parentId}`, `Add ${item.seasonName || 'season'}`, item.seasonId || item.parentId, 'Episode', 'Season added to queue.');
            await addOption(`series-${item.seriesId}`, `Add ${item.seriesName || 'series'}`, item.seriesId, 'Episode', 'Series added to queue.');
        } else if (type === 'season') {
            await addOption(`season-${item.mediaId}`, `Add ${item.title}`, item.mediaId, 'Episode', 'Season added to queue.');
            if (item.seriesId) await addOption(`series-${item.seriesId}`, `Add ${item.seriesName || 'series'}`, item.seriesId, 'Episode', 'Series added to queue.');
        } else if (type === 'series') {
            await addOption(`series-${item.mediaId}`, `Add ${item.title}`, item.mediaId, 'Episode', 'Series added to queue.');
        } else if (type === 'boxset') {
            await addOption(`collection-${item.mediaId}`, `Add ${item.title}`, item.mediaId, 'Movie,Episode,Series', 'Collection added to queue.');
        } else if (type === 'movie') {
            const collections = await this.findCollectionsForItem(item);
            collections.forEach(collection => options.push(collection));
        }

        return options;
    }

    async fetchQueueGroupItems(parentId, includeTypes, libraryId = '') {
        const userId = this.currentJellyfinUserId();
        if (!userId || !parentId) return [];
        const params = new URLSearchParams({
            ParentId: parentId,
            Recursive: 'true',
            IncludeItemTypes: includeTypes,
            SortBy: 'ParentIndexNumber,IndexNumber,SortName',
            SortOrder: 'Ascending',
            Fields: 'Overview,ParentId',
            Limit: '500'
        });
        const data = await this.fetchJson(`/Users/${encodeURIComponent(userId)}/Items?${params}`);
        return (data.Items || data.items || [])
            .flatMap(found => this.queueItemsFromJellyfinItem(found, libraryId))
            .filter(found => found.mediaId && found.title);
    }

    queueItemsFromJellyfinItem(item, libraryId = '') {
        const type = item.Type || item.type || item.MediaType || item.mediaType || '';
        if (String(type).toLowerCase() === 'series') {
            return [{
                title: item.Name || item.name || 'Untitled series',
                mediaId: item.Id || item.id || '',
                libraryId,
                mediaType: type,
                overview: item.Overview || item.overview || ''
            }];
        }

        return [{
            title: this.mediaTitle(item),
            mediaId: item.Id || item.id || '',
            libraryId,
            mediaType: type,
            overview: item.Overview || item.overview || ''
        }];
    }

    async findCollectionsForItem(item) {
        const userId = this.currentJellyfinUserId();
        if (!userId || !item?.mediaId) return [];

        const params = new URLSearchParams({
            Recursive: 'true',
            IncludeItemTypes: 'BoxSet',
            Fields: 'Overview',
            Limit: '100'
        });

        try {
            const data = await this.fetchJson(`/Users/${encodeURIComponent(userId)}/Items?${params}`);
            const collections = data.Items || data.items || [];
            const matches = [];
            for (const collection of collections) {
                const collectionId = collection.Id || collection.id || '';
                if (!collectionId) continue;
                const members = await this.fetchQueueGroupItems(collectionId, 'Movie,Episode,Series', item.libraryId);
                if (members.some(member => member.mediaId === item.mediaId)) {
                    matches.push({
                        key: `collection-${collectionId}`,
                        label: `Add ${collection.Name || collection.name || 'collection'}`,
                        items: members,
                        successMessage: 'Collection added to queue.'
                    });
                }
            }
            return matches;
        } catch (e) {
            console.warn('Collection lookup failed:', e);
            return [];
        }
    }

    currentJellyfinUserId() {
        const apiClient = window.ApiClient;
        const apiUserId = apiClient?._serverInfo?.UserId || apiClient?.serverInfo?.UserId || apiClient?._currentUser?.Id || apiClient?._currentUser?.id || '';
        if (apiUserId) return apiUserId;
        if (this.currentJellyfinMediaUserId) return this.currentJellyfinMediaUserId;
        return this.currentUser && this.currentUser !== 'Unknown' ? this.currentUser : '';
    }

    async addMediaToQueue(item) {
        if (!item?.title || !this.currentRoom) return;
        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Queue`, item);
            if (!resp.ok) throw new Error("Queue add failed");
            this.hideModal();
            await this.refreshRoom();
            this.showToast("Added to queue.", 'success');
        } catch (e) {
            console.error("Queue Error:", e);
            this.showToast("Failed to add queue item.", 'error');
        }
    }

    async addMediaGroupToQueue(items, successMessage) {
        if (!items?.length || !this.currentRoom) return;
        try {
            for (const item of items) {
                const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Queue`, item);
                if (!resp.ok) throw new Error("Queue group add failed");
            }
            this.hideModal();
            await this.refreshRoom();
            this.showToast(successMessage || "Items added to queue.", 'success');
        } catch (e) {
            console.error("Queue Group Error:", e);
            this.showToast("Failed to add all queue items.", 'error');
        }
    }

    async commitInlineRoomName() {
        const input = document.getElementById('current-room-name');
        if (!input || !this.currentRoom || !this.canManage()) return;

        const nextName = input.value.trim();
        if (!nextName) {
            input.value = this.currentRoom.name;
            return;
        }

        if (nextName === this.currentRoom.name) return;
        await this.renameRoomTo(nextName);
    }

    async renameRoomTo(name) {
        if (!name || !name.trim() || !this.currentRoom) return;
        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Rename`, name.trim());
            if (!resp.ok) throw new Error("Rename failed");
            await this.refreshRoom();
            this.showToast("Room renamed.", 'success');
        } catch (e) {
            console.error("Rename Room Error:", e);
            this.showToast("Failed to rename room.", 'error');
        }
    }

    async deleteRoom() {
        if (!this.currentRoom || !this.isOwner()) return;
        this.showModal('Delete this room?', [], [
            { label: 'Delete Room', danger: true, onClick: () => this.deleteRoomConfirmed() }
        ]);
    }

    async deleteRoomConfirmed() {
        if (!this.currentRoom) return;

        try {
            const resp = await this.request(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}`, { method: 'DELETE' });
            if (!resp.ok) throw new Error("Delete failed");
            this.currentRoom = null;
            this.stopRoomPolling();
            this.showView('lobby');
            await this.loadRooms();
            this.showToast("Room deleted.", 'success');
        } catch (e) {
            console.error("Delete Room Error:", e);
            this.showToast("Failed to delete room.", 'error');
        }
    }

    async addTheory() {
        this.showModal('New theory', [
            { id: 'text', label: 'Observation', placeholder: 'What did you notice?' }
        ], [
            { label: 'Add', primary: true, onClick: ({ text }) => this.addTheoryText(text) }
        ]);
    }

    async addTheoryText(text) {
        if (!text || !text.trim()) return;
        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Theories`, text.trim());
            if (!resp.ok) throw new Error("Theory add failed");
            await this.refreshRoom();
        } catch (e) {
            console.error("Theory Error:", e);
            this.showToast("Failed to add theory.", 'error');
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
            const content = document.createElement('div');
            content.className = 'queue-item-content';
            content.appendChild(this.textEl('span', item.title));
            const meta = [`Added by ${item.addedBy || 'Unknown'}`];
            if (item.mediaType) meta.push(item.mediaType);
            content.appendChild(this.textEl('span', meta.join(' • '), 'item-meta'));
            row.appendChild(content);

            const actions = document.createElement('div');
            actions.className = 'queue-actions';
            if (this.currentRoom.allowQueueVoting) {
                const voteLabel = item.upvotes?.includes(this.currentUser) ? `Voted (${item.upvotes.length})` : `Vote (${item.upvotes?.length || 0})`;
                actions.appendChild(this.button(voteLabel, item.upvotes?.includes(this.currentUser) ? 'micro-command active' : 'micro-command', () => this.toggleQueueVote(item.id)));
            }
            if (this.canControlPlayback()) {
                if (item.mediaId) {
                    actions.appendChild(this.button('Start', 'micro-command primary', () => this.showStartWatchPartyModal(item)));
                }
            }
            if (this.canManage()) {
                actions.appendChild(this.button('Up', 'micro-command', () => this.moveQueueItem(item.id, -1)));
                actions.appendChild(this.button('Down', 'micro-command', () => this.moveQueueItem(item.id, 1)));
            }
            if (this.canManage() || item.addedBy === this.currentUser) {
                actions.appendChild(this.button('Remove', 'micro-command', () => this.removeQueueItem(item.id)));
            }
            row.appendChild(actions);

            container.appendChild(row);
        });
    }

    renderPlayerState() {
        const title = document.getElementById('now-playing-title');
        if (!title || !this.currentRoom) return;
        title.textContent = this.currentRoom.nowPlayingTitle
            ? `Now playing: ${this.currentRoom.nowPlayingTitle}`
            : 'No synced media selected';
    }

    async showStartWatchPartyModal(item) {
        if (!item?.mediaId || !this.currentRoom || !this.canControlPlayback()) return;
        this.hideModal();

        const overlay = document.createElement('div');
        overlay.id = 'app-modal-overlay';
        overlay.className = 'app-modal-overlay';
        const modal = document.createElement('div');
        modal.id = 'app-modal';
        modal.className = 'app-modal glass-card playback-modal';
        modal.appendChild(this.textEl('h3', 'Start Watch Party'));
        modal.appendChild(this.textEl('p', item.title, 'modal-subtitle'));

        const targetList = document.createElement('div');
        targetList.className = 'playback-target-list';
        targetList.appendChild(this.textEl('div', 'Finding active Jellyfin sessions...', 'loading'));
        modal.appendChild(targetList);

        const actionRow = document.createElement('div');
        actionRow.className = 'split-actions';
        const startButton = this.button('Start', 'primary-command', () => this.startWatchParty(item.id, this.selectedPlaybackTargets(targetList)));
        startButton.disabled = true;
        actionRow.appendChild(startButton);
        actionRow.appendChild(this.button('Close', 'secondary-command', () => this.hideModal()));
        modal.appendChild(actionRow);

        overlay.onclick = (event) => { if (event.target === overlay) this.hideModal(); };
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        try {
            const targets = await this.fetchJson(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/PlaybackTargets`);
            this.renderPlaybackTargets(targetList, targets || [], startButton);
        } catch (e) {
            console.error("Playback Targets Error:", e);
            targetList.replaceChildren(this.textEl('div', 'Could not load active Jellyfin sessions.', 'loading'));
        }
    }

    renderPlaybackTargets(container, targets, startButton) {
        this.clear(container);
        const eligible = targets.filter(target => target.canStartPlayback || (target.isActive && target.supportsRemoteControl && target.supportsMediaControl));
        if (!eligible.length) {
            container.appendChild(this.textEl('div', 'No active controllable Jellyfin sessions found for people in this room. Open Jellyfin on Android TV or another client, then try again.', 'loading'));
            startButton.disabled = true;
            return;
        }

        eligible.forEach(target => {
            const label = document.createElement('label');
            label.className = 'playback-target';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = target.sessionId;
            input.checked = true;
            input.addEventListener('change', () => {
                startButton.disabled = this.selectedPlaybackTargets(container).length === 0;
            });
            label.appendChild(input);
            const text = document.createElement('span');
            const title = document.createElement('strong');
            title.textContent = target.userName || target.userId || 'Jellyfin user';
            if (target.isAndroidTv) {
                title.appendChild(this.textEl('span', 'Android TV', 'target-badge'));
            }
            text.appendChild(title);
            text.appendChild(this.textEl('em', [target.client, target.deviceName, target.eligibilityReason].filter(Boolean).join(' • ') || 'Active session'));
            label.appendChild(text);
            container.appendChild(label);
        });
        startButton.disabled = false;
    }

    selectedPlaybackTargets(container) {
        return [...container.querySelectorAll('input[type="checkbox"]:checked')]
            .map(input => input.value)
            .filter(Boolean);
    }

    async startWatchParty(itemId, targetSessionIds) {
        if (!this.currentRoom || !itemId) return;
        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Queue/${encodeURIComponent(itemId)}/Start`, { targetSessionIds });
            if (!resp.ok) throw new Error(await resp.text());
            const result = await resp.json();
            this.hideModal();
            await this.refreshRoom();
            this.showToast(`Started ${result.title || 'watch party'} on ${result.startedCount || 0} session${result.startedCount === 1 ? '' : 's'}.`, 'success');
        } catch (e) {
            console.error("Start Watch Party Error:", e);
            this.showToast("Could not start playback. Make sure participants have active controllable Jellyfin clients.", 'error');
        }
    }

    async toggleQueueVote(itemId) {
        if (!this.currentRoom || !itemId) return;
        try {
            const resp = await this.request(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Queue/${encodeURIComponent(itemId)}/Vote`, { method: 'POST' });
            if (!resp.ok) throw new Error("Queue vote failed");
            await this.refreshRoom();
        } catch (e) {
            console.error("Queue Vote Error:", e);
            this.showToast("Failed to update queue vote.", 'error');
        }
    }

    async moveQueueItem(itemId, direction) {
        if (!this.currentRoom || !itemId || !this.canManage()) return;
        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Queue/${encodeURIComponent(itemId)}/Move`, direction);
            if (!resp.ok) throw new Error("Queue move failed");
            await this.refreshRoom();
        } catch (e) {
            console.error("Queue Move Error:", e);
            this.showToast("Failed to reorder queue.", 'error');
        }
    }

    async removeQueueItem(itemId) {
        if (!this.currentRoom || !itemId) return;
        try {
            const resp = await this.request(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Queue/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
            if (!resp.ok) throw new Error("Queue remove failed");
            await this.refreshRoom();
            this.showToast("Queue item removed.", 'success');
        } catch (e) {
            console.error("Queue Remove Error:", e);
            this.showToast("Failed to remove queue item.", 'error');
        }
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
            const noteHeader = document.createElement('div');
            noteHeader.className = 'sticky-note-header';
            noteHeader.appendChild(this.textEl('strong', note.author || 'Unknown'));
            if (this.canManage() || note.author === this.currentUser) {
                noteHeader.appendChild(this.button('Remove', 'micro-command dark', () => this.removeTheory(note.id)));
            }
            noteEl.appendChild(noteHeader);
            noteEl.appendChild(document.createElement('br'));
            noteEl.appendChild(document.createTextNode(note.text || ''));
            container.appendChild(noteEl);
        });
    }

    async removeTheory(theoryId) {
        if (!this.currentRoom || !theoryId) return;
        try {
            const resp = await this.request(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Theories/${encodeURIComponent(theoryId)}`, { method: 'DELETE' });
            if (!resp.ok) throw new Error("Theory remove failed");
            await this.refreshRoom();
            this.showToast("Theory removed.", 'success');
        } catch (e) {
            console.error("Theory Remove Error:", e);
            this.showToast("Failed to remove theory.", 'error');
        }
    }

    renderCinemaSeats() {
        const dataStr = JSON.stringify({
            seats: this.currentRoom.cinemaSeats,
            participants: this.currentRoom.participants,
            ownerId: this.currentRoom.ownerId,
            coHostIds: this.currentRoom.coHostIds,
            currentUser: this.currentUser
        });
        if (dataStr === this._lastCinemaData) return;
        this._lastCinemaData = dataStr;

        const container = document.getElementById('cinema-seats');
        this.clear(container);
        for (let i = 0; i < 40; i++) {
            const seat = document.createElement('button');
            seat.type = 'button';
            seat.className = 'seat';
            seat.dataset.seat = String(i + 1);
            seat.setAttribute('aria-label', `Seat ${i + 1}`);

            const occupant = this.seatOccupant(i);
            const label = document.createElement('span');
            label.className = 'seat-label';
            label.textContent = String(i + 1);
            seat.appendChild(label);

            if (occupant?.userId) {
                const isCurrentUser = occupant.userId === this.currentUser;
                seat.classList.add('occupied');
                if (isCurrentUser) seat.classList.add('my-seat');
                seat.setAttribute('aria-label', `Seat ${i + 1}, ${occupant.userId}${isCurrentUser ? ', your seat' : ''}`);
                seat.dataset.tooltip = `${occupant.userId} • ${occupant.role}${isCurrentUser ? ' • You' : ''}`;
                seat.appendChild(this.participantAvatar(occupant.userId, 'seat-avatar'));
                seat.onclick = () => this.showSeatDetails(i, occupant);
            } else {
                seat.classList.add('available');
                seat.dataset.tooltip = `Seat ${i + 1} is open. Click to sit here.`;
                seat.onclick = () => this.moveToSeat(i);
            }
            container.appendChild(seat);
        }
    }

    seatOccupant(seatIndex) {
        const match = Object.entries(this.currentRoom?.cinemaSeats || {})
            .find(([, assignedSeat]) => Number(assignedSeat) === seatIndex);
        if (!match) return null;

        const [userId] = match;
        return {
            userId,
            role: this.participantRole(userId),
            canChat: this.currentRoom.permissions?.[userId]?.canChat !== false,
            canControlPlayback: this.currentRoom.permissions?.[userId]?.canControlPlayback === true
        };
    }

    participantRole(userId) {
        if (this.currentRoom?.ownerId === userId) return 'Host';
        if (this.currentRoom?.coHostIds?.includes(userId)) return 'Co-host';
        return 'Guest';
    }

    participantInitials(userId) {
        const parts = String(userId || '?').split(/[\s._@-]+/).filter(Boolean);
        const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : String(userId || '?').slice(0, 2);
        return letters.toUpperCase();
    }

    participantAvatar(userId, className) {
        const wrapper = this.textEl('span', this.participantInitials(userId), `${className} avatar-fallback`);
        if (!userId || userId === 'Unknown') return wrapper;

        const image = document.createElement('img');
        image.alt = '';
        image.loading = 'lazy';
        image.src = `/Users/${encodeURIComponent(userId)}/Images/Primary?fillHeight=96&fillWidth=96&quality=90`;
        image.onload = () => {
            wrapper.textContent = '';
            wrapper.classList.remove('avatar-fallback');
            wrapper.appendChild(image);
        };
        image.onerror = () => image.remove();
        return wrapper;
    }

    async moveToSeat(seatIndex) {
        if (!this.currentRoom?.id) return;
        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Seats/${seatIndex}`, {});
            if (!resp.ok) throw new Error("Seat move failed");
            await this.refreshRoom();
            this.showToast(`Moved to seat ${seatIndex + 1}.`, 'success');
        } catch (e) {
            console.error("Seat Move Error:", e);
            this.showToast("That seat is no longer available.", 'error');
        }
    }

    showSeatDetails(seatIndex, occupant) {
        this.hideModal();

        const overlay = document.createElement('div');
        overlay.id = 'app-modal-overlay';
        overlay.className = 'app-modal-overlay';
        const modal = document.createElement('div');
        modal.id = 'app-modal';
        modal.className = 'app-modal glass-card seat-modal';
        modal.appendChild(this.textEl('h3', `Seat ${seatIndex + 1}`));

        modal.appendChild(this.participantAvatar(occupant.userId, 'seat-modal-avatar'));
        modal.appendChild(this.textEl('strong', occupant.userId, 'seat-modal-name'));
        modal.appendChild(this.textEl('span', occupant.role, `role-badge ${occupant.role === 'Host' ? 'role-owner' : occupant.role === 'Co-host' ? 'role-cohost' : ''}`));

        const details = document.createElement('div');
        details.className = 'seat-detail-grid';
        details.appendChild(this.textEl('span', occupant.canChat ? 'Chat enabled' : 'Chat muted'));
        details.appendChild(this.textEl('span', occupant.canControlPlayback ? 'Playback control' : 'No playback control'));
        if (occupant.userId === this.currentUser) details.appendChild(this.textEl('span', 'This is your current seat'));
        modal.appendChild(details);

        const actionRow = document.createElement('div');
        actionRow.className = 'split-actions';
        if (occupant.userId !== this.currentUser) {
            actionRow.appendChild(this.button('Send wave', 'secondary-command', () => {
                this.hideModal();
                this.addReaction('👋');
                this.showToast(`Waved to ${occupant.userId}.`, 'success');
            }));
        }
        actionRow.appendChild(this.button('Close', 'secondary-command', () => this.hideModal()));
        modal.appendChild(actionRow);
        overlay.onclick = (event) => { if (event.target === overlay) this.hideModal(); };
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
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
        if (!stageId || !botToken) {
            this.showToast("Please enter both Discord Stage ID and bot token.", 'error');
            return;
        }

        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/DiscordStage`, { botToken, stageId });
            if (!resp.ok) throw new Error("Discord config failed");
            document.getElementById('discord-bot-token').value = '';
            this.showToast("Discord Stage configured.", 'success');
        } catch (e) {
            console.error("Discord Config Error:", e);
            this.showToast("Failed to save Discord Stage settings.", 'error');
        }
    }

    async syncDiscordStage(titleOverride = null) {
        if (!titleOverride) {
            this.showModal('Sync Discord Stage', [
                { id: 'title', label: 'Topic', placeholder: 'Watching...' }
            ], [
                { label: 'Sync', primary: true, onClick: ({ title }) => this.syncDiscordStage(title) }
            ]);
            return;
        }

        const title = titleOverride;
        if (!title || !title.trim()) return;
        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/SyncStage`, title.trim());
            if (!resp.ok) throw new Error("Discord sync failed");
            this.showToast("Discord Stage synced.", 'success');
        } catch (e) {
            console.error("Discord Sync Error:", e);
            this.showToast("Failed to sync Discord Stage.", 'error');
        }
    }

    async sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text || !this.currentRoom || !this.canChat()) return;
        input.value = '';
        try {
            const payload = {
                text,
                replyToMessageId: this.replyTarget?.id || ''
            };
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Messages`, payload);
            if (!resp.ok) throw new Error("Send message failed");
            this.replyTarget = null;
            await this.refreshRoom();
        } catch (e) {
            console.error("Send Message Error:", e);
            this.showToast("Failed to send message.", 'error');
        }
    }

    setReplyTarget(message) {
        this.replyTarget = message;
        const input = document.getElementById('chat-input');
        if (input) {
            input.placeholder = `Replying to ${message.userName}`;
            input.focus();
        }
        this.showToast(`Replying to ${message.userName}.`, 'info');
    }

    clearReplyTarget() {
        this.replyTarget = null;
        const input = document.getElementById('chat-input');
        if (input) input.placeholder = 'Type a message...';
    }

    async toggleMessageReaction(messageId, emoji) {
        if (!this.currentRoom || !messageId) return;
        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Messages/${encodeURIComponent(messageId)}/Reactions`, emoji);
            if (!resp.ok) throw new Error("Message reaction failed");
            await this.refreshRoom();
        } catch (e) {
            console.error("Message Reaction Error:", e);
            this.showToast("Failed to update reaction.", 'error');
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
            const resp = await this.request(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Updates?since=${encodeURIComponent(this.lastUpdate)}`);
            if (resp.status === 200) {
                this.currentRoom = this.normalizeRoom(await resp.json());
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
            const isMentioned = msg.mentions?.includes(this.currentUser);
            bubble.className = `message ${msg.userName === this.currentUser ? 'sent' : 'received'}${isMentioned ? ' mentioned' : ''}`;
            bubble.appendChild(this.textEl('span', msg.userName, 'user'));
            if (msg.replyToMessageId) {
                const reply = document.createElement('div');
                reply.className = 'message-reply-context';
                reply.appendChild(this.textEl('strong', msg.replyToUserName || 'Reply'));
                reply.appendChild(this.textEl('span', msg.replyToText || 'Previous message'));
                bubble.appendChild(reply);
            }
            bubble.appendChild(this.renderMessageText(msg.text));

            const actions = document.createElement('div');
            actions.className = 'message-actions';
            actions.appendChild(this.button('Reply', 'message-action', () => this.setReplyTarget(msg)));
            ['👍', '😂', '🔥', '👏'].forEach(emoji => {
                actions.appendChild(this.button(emoji, 'message-action emoji-action', () => this.toggleMessageReaction(msg.id, emoji)));
            });
            bubble.appendChild(actions);

            const reactions = Object.entries(msg.reactions || {}).filter(([, users]) => users?.length);
            if (reactions.length) {
                const reactionRow = document.createElement('div');
                reactionRow.className = 'message-reactions';
                reactions.forEach(([emoji, users]) => {
                    reactionRow.appendChild(this.button(`${emoji} ${users.length}`, users.includes(this.currentUser) ? 'reaction-chip active' : 'reaction-chip', () => this.toggleMessageReaction(msg.id, emoji)));
                });
                bubble.appendChild(reactionRow);
            }
            container.appendChild(bubble);
        });
        container.scrollTop = container.scrollHeight;
    }

    renderMessageText(text) {
        const el = document.createElement('div');
        el.className = 'message-text';
        const participants = new Set((this.currentRoom?.participants || []).flatMap(user => [user, String(user).split('@')[0]]));
        String(text || '').split(/(@[\w.\-]+)/g).forEach(part => {
            if (!part) return;
            const token = part.startsWith('@') ? part.slice(1) : '';
            if (token && participants.has(token)) {
                el.appendChild(this.textEl('span', part, 'mention-token'));
            } else {
                el.appendChild(document.createTextNode(part));
            }
        });
        return el;
    }

    renderParticipants() {
        const dataStr = JSON.stringify({
            participants: this.currentRoom.participants,
            ownerId: this.currentRoom.ownerId,
            coHostIds: this.currentRoom.coHostIds,
            permissions: this.currentRoom.permissions,
            canManageParticipants: this.canManageParticipants()
        });
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

            const perms = this.currentRoom.permissions?.[userId] || {};
            const badges = document.createElement('div');
            badges.className = 'participant-permission-badges';
            if (perms.canChat === false) badges.appendChild(this.textEl('span', 'Muted'));
            if (perms.canControlPlayback === false) badges.appendChild(this.textEl('span', 'No control'));
            if (perms.canAddToQueue === false) badges.appendChild(this.textEl('span', 'No queue'));
            if (perms.canManageParticipants === true) badges.appendChild(this.textEl('span', 'Moderator'));
            if (badges.childElementCount) item.appendChild(badges);

            if (this.canManageParticipants() && userId !== this.currentUser && this.currentRoom.ownerId !== userId) {
                const actions = document.createElement('div');
                actions.className = 'participant-actions';
                actions.appendChild(this.button(perms.canChat === false ? 'Unmute' : 'Mute', 'micro-command', () => this.updateParticipantPermissions(userId, { canChat: perms.canChat === false })));
                actions.appendChild(this.button(perms.canControlPlayback === false ? 'Allow Control' : 'No Control', 'micro-command', () => this.updateParticipantPermissions(userId, { canControlPlayback: perms.canControlPlayback === false })));
                actions.appendChild(this.button(perms.canAddToQueue === false ? 'Allow Queue' : 'No Queue', 'micro-command', () => this.updateParticipantPermissions(userId, { canAddToQueue: perms.canAddToQueue === false })));
                if (this.isOwner()) actions.appendChild(this.button(perms.canManageParticipants === true ? 'Revoke Mod' : 'Make Mod', 'micro-command', () => this.updateParticipantPermissions(userId, { canManageParticipants: perms.canManageParticipants !== true })));
                actions.appendChild(this.button('Kick', 'micro-command', () => this.participantAction(userId, 'Kick')));
                actions.appendChild(this.button('Ban', 'micro-command', () => this.participantAction(userId, 'Ban')));
                item.appendChild(actions);
            }

            list.appendChild(item);
        });
    }

    renderPendingParticipants() {
        const dataStr = JSON.stringify({
            pending: this.currentRoom.pendingParticipantIds,
            banned: this.currentRoom.bannedParticipantIds,
            canManageParticipants: this.canManageParticipants()
        });
        if (dataStr === this._lastPendingData) return;
        this._lastPendingData = dataStr;

        const list = document.getElementById('pending-participant-list');
        if (!list) return;
        this.clear(list);
        if (!this.canManageParticipants()) return;

        (this.currentRoom.pendingParticipantIds || []).forEach(userId => {
            const item = document.createElement('div');
            item.className = 'participant-item pending';
            item.appendChild(this.textEl('span', userId, 'user-name'));
            item.appendChild(this.textEl('span', 'Pending', 'role-badge'));
            const actions = document.createElement('div');
            actions.className = 'participant-actions';
            actions.appendChild(this.button('Approve', 'micro-command active', () => this.participantAction(userId, 'Approve')));
            actions.appendChild(this.button('Reject', 'micro-command', () => this.participantAction(userId, 'Reject')));
            actions.appendChild(this.button('Ban', 'micro-command', () => this.participantAction(userId, 'Ban')));
            item.appendChild(actions);
            list.appendChild(item);
        });

        (this.currentRoom.bannedParticipantIds || []).forEach(userId => {
            const item = document.createElement('div');
            item.className = 'participant-item banned';
            item.appendChild(this.textEl('span', userId, 'user-name'));
            item.appendChild(this.textEl('span', 'Banned', 'role-badge'));
            const actions = document.createElement('div');
            actions.className = 'participant-actions';
            actions.appendChild(this.button('Unban', 'micro-command', () => this.participantAction(userId, 'Unban')));
            item.appendChild(actions);
            list.appendChild(item);
        });
    }

    async participantAction(userId, action) {
        if (!this.currentRoom || !userId) return;
        try {
            const resp = await this.request(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Participants/${encodeURIComponent(userId)}/${action}`, { method: 'POST' });
            if (!resp.ok) throw new Error(`${action} failed`);
            await this.refreshRoom();
        } catch (e) {
            console.error(`${action} Error:`, e);
            this.showToast('Participant action failed.', 'error');
        }
    }

    async updateParticipantPermissions(userId, changes) {
        if (!this.currentRoom || !userId) return;
        const current = this.currentRoom.permissions?.[userId] || {};
        const payload = {
            canChat: current.canChat !== false,
            canControlPlayback: current.canControlPlayback !== false,
            canAddToQueue: current.canAddToQueue !== false,
            canManageParticipants: current.canManageParticipants === true,
            ...changes
        };
        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Participants/${encodeURIComponent(userId)}/Permissions`, payload);
            if (!resp.ok) throw new Error('Permissions update failed');
            await this.refreshRoom();
        } catch (e) {
            console.error('Permissions Error:', e);
            this.showToast('Could not update participant permissions.', 'error');
        }
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
        this.showModal('Create poll', [
            { id: 'question', label: 'Question', placeholder: 'What should we watch next?' },
            { id: 'options', label: 'Options', placeholder: 'Option one, option two' }
        ], [
            { label: 'Create', primary: true, onClick: ({ question, options }) => this.createPoll(question, options) }
        ]);
    }

    async createPoll(question, rawOptions) {
        if (!question || !question.trim()) return;
        const options = (rawOptions || '').split(',').map(o => o.trim()).filter(Boolean);
        if (options.length < 2) {
            this.showToast("Enter at least two poll options.", 'error');
            return;
        }

        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Polls`, { question: question.trim(), options });
            if (!resp.ok) throw new Error("Poll create failed");
            await this.refreshRoom();
        } catch (e) {
            console.error("Poll Create Error:", e);
            this.showToast("Failed to create poll.", 'error');
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
        if (view === 'lobby') {
            ['sidebar-tabs', 'participant-section', 'room-management', 'host-theme-controls', 'host-discord-stage', 'poll-section', 'reaction-bar', 'chat-container'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        }
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

    canManageParticipants() {
        if (!this.currentRoom) return false;
        if (this.canManage()) return true;
        return this.currentRoom.permissions?.[this.currentUser]?.canManageParticipants === true;
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

    canAddQueue() {
        if (!this.currentRoom) return false;
        const perms = this.currentRoom.permissions?.[this.currentUser];
        return this.canManage() || (this.allowParticipantQueueAdds && (!perms || perms.canAddToQueue !== false));
    }

    canControlPlayback() {
        if (!this.currentRoom) return false;
        if (this.canManage()) return true;
        if (this.currentRoom.isHostOnlyControl) return false;
        const perms = this.currentRoom.permissions?.[this.currentUser];
        return !perms || perms.canControlPlayback !== false;
    }

    async generateAdvancedInvite() {
        this.showModal('Invite settings', [
            { id: 'canChat', type: 'checkbox', label: 'Allow chat', checked: true },
            { id: 'canControl', type: 'checkbox', label: 'Allow playback control', checked: true },
            { id: 'canAddToQueue', type: 'checkbox', label: 'Allow queue adds', checked: true },
            { id: 'hours', type: 'number', label: 'Hours valid, 0 for no expiration', value: '24', min: '0' }
        ], [
            { label: 'Generate', primary: true, onClick: (values) => this.createAdvancedInvite(values) }
        ]);
    }

    async createAdvancedInvite({ canChat, canControl, canAddToQueue, hours }) {
        const hoursValid = parseInt(hours || "24", 10);
        try {
            const resp = await this.fetchJson(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Invitations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ canChat, canControl, canAddToQueue, hoursValid: Number.isNaN(hoursValid) ? 24 : hoursValid, maxUses: 0 })
            });
            this.showInviteLink(resp.code);
        } catch (e) {
            console.error("Invite Gen Error:", e);
            this.showToast("Failed to generate invite.", 'error');
        }
    }

    showInviteLink(code) {
        const link = this.companionUrl(code);
        this.renderInviteQr(link);
        document.getElementById('share-link-text').value = link;
        this.updateCompanionPills();
        document.getElementById('invite-code-text').textContent = code;
    }

    updateInviteQrVisibility() {
        const link = document.getElementById('share-link-text')?.value;
        if (link) this.renderInviteQr(link);
    }

    renderInviteQr(link) {
        const qrContainer = document.getElementById('qr-container');
        const showQr = document.getElementById('show-qr-code')?.checked !== false;
        if (!qrContainer) return;

        this.clear(qrContainer);
        qrContainer.style.display = showQr ? 'block' : 'none';
        if (!showQr) return;

        try {
            qrContainer.appendChild(this.createQrSvg(link));
        } catch (e) {
            console.error("QR Render Error:", e);
            qrContainer.textContent = "QR unavailable";
        }
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
        await this.copyText(document.getElementById('share-link-text').value, "Invite link copied.");
    }

    async copyCompanionLink() {
        const currentSetting = document.getElementById('public-companion-url')?.value?.trim();
        await this.copyText(currentSetting || this.companionUrl(), "Companion link copied.");
    }

    async copyText(value, message) {
        if (!value) {
            this.showToast("Nothing to copy yet.", 'error');
            return;
        }

        try {
            await navigator.clipboard.writeText(value);
            this.showToast(message, 'success');
        } catch (e) {
            console.error("Copy Error:", e);
            this.showToast("Copy failed. Select the text and copy it manually.", 'error');
        }
    }

    async savePublicAccessSettings() {
        const publicJellyfinUrl = document.getElementById('public-jellyfin-url')?.value?.trim() || "";
        const publicCompanionUrl = this.generatedCompanionUrl(publicJellyfinUrl);

        try {
            const resp = await this.request('/jelltogether/Settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ publicJellyfinUrl, publicCompanionUrl })
            });
            if (!resp.ok) throw new Error(`Settings save failed with ${resp.status}`);
            await this.loadSettings();
            this.showToast("Public access settings saved.", 'success');
        } catch (e) {
            console.error("Settings Save Error:", e);
            this.showToast("Only Jellyfin administrators can save public access settings.", 'error');
        }
    }

    async copyInvite() {
        await this.copyText(document.getElementById('invite-code-text').textContent, "Invite code copied.");
    }

    createQrSvg(text) {
        const qr = this.createQrMatrix(text);
        const quiet = 4;
        const size = qr.length + quiet * 2;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Invite QR code');

        const bg = document.createElementNS(svg.namespaceURI, 'rect');
        bg.setAttribute('width', size);
        bg.setAttribute('height', size);
        bg.setAttribute('fill', '#ffffff');
        svg.appendChild(bg);

        const path = document.createElementNS(svg.namespaceURI, 'path');
        const parts = [];
        for (let y = 0; y < qr.length; y++) {
            for (let x = 0; x < qr.length; x++) {
                if (qr[y][x]) parts.push(`M${x + quiet},${y + quiet}h1v1h-1z`);
            }
        }
        path.setAttribute('d', parts.join(''));
        path.setAttribute('fill', '#08111f');
        svg.appendChild(path);
        return svg;
    }

    createQrMatrix(text) {
        const versions = [
            null,
            { version: 1, size: 21, dataCodewords: 19, ecCodewords: 7, alignment: [], blocks: [19] },
            { version: 2, size: 25, dataCodewords: 34, ecCodewords: 10, alignment: [6, 18], blocks: [34] },
            { version: 3, size: 29, dataCodewords: 55, ecCodewords: 15, alignment: [6, 22], blocks: [55] },
            { version: 4, size: 33, dataCodewords: 80, ecCodewords: 20, alignment: [6, 26], blocks: [80] },
            { version: 5, size: 37, dataCodewords: 108, ecCodewords: 26, alignment: [6, 30], blocks: [108] },
            { version: 6, size: 41, dataCodewords: 136, ecCodewords: 18, alignment: [6, 34], blocks: [68, 68] },
            { version: 7, size: 45, dataCodewords: 156, ecCodewords: 20, alignment: [6, 22, 38], blocks: [78, 78] },
            { version: 8, size: 49, dataCodewords: 194, ecCodewords: 24, alignment: [6, 24, 42], blocks: [97, 97] },
            { version: 9, size: 53, dataCodewords: 232, ecCodewords: 30, alignment: [6, 26, 46], blocks: [116, 116] },
            { version: 10, size: 57, dataCodewords: 274, ecCodewords: 18, alignment: [6, 28, 50], blocks: [68, 68, 69, 69] }
        ];
        const bytes = Array.from(new TextEncoder().encode(text));
        const spec = versions.find(v => v && bytes.length <= v.dataCodewords - 2);
        if (!spec) throw new Error("Invite link is too long for built-in QR generator.");

        const data = this.qrDataCodewords(bytes, spec.dataCodewords);
        const codewords = this.qrInterleavedCodewords(data, spec);
        const bits = codewords.flatMap(b => Array.from({ length: 8 }, (_, i) => (b >>> (7 - i)) & 1));
        const modules = Array.from({ length: spec.size }, () => Array(spec.size).fill(false));
        const reserved = Array.from({ length: spec.size }, () => Array(spec.size).fill(false));

        this.qrDrawFunctionPatterns(modules, reserved, spec);
        if (spec.version >= 7) this.qrDrawVersionBits(modules, reserved, spec.version);
        this.qrDrawData(modules, reserved, bits);
        this.qrDrawFormatBits(modules, reserved, 0);
        return modules;
    }

    qrInterleavedCodewords(data, spec) {
        const dataBlocks = [];
        const ecBlocks = [];
        let offset = 0;

        for (const size of spec.blocks) {
            const block = data.slice(offset, offset + size);
            offset += size;
            dataBlocks.push(block);
            ecBlocks.push(this.qrReedSolomon(block, spec.ecCodewords));
        }

        const interleaved = [];
        const maxDataLength = Math.max(...dataBlocks.map(block => block.length));
        for (let i = 0; i < maxDataLength; i++) {
            for (const block of dataBlocks) {
                if (i < block.length) interleaved.push(block[i]);
            }
        }
        for (let i = 0; i < spec.ecCodewords; i++) {
            for (const block of ecBlocks) interleaved.push(block[i]);
        }
        return interleaved;
    }

    qrDataCodewords(bytes, dataCodewords) {
        const bits = [0, 1, 0, 0];
        for (let i = 7; i >= 0; i--) bits.push((bytes.length >>> i) & 1);
        for (const byte of bytes) {
            for (let i = 7; i >= 0; i--) bits.push((byte >>> i) & 1);
        }
        bits.push(0, 0, 0, 0);
        while (bits.length % 8) bits.push(0);

        const data = [];
        for (let i = 0; i < bits.length && data.length < dataCodewords; i += 8) {
            data.push(bits.slice(i, i + 8).reduce((v, bit) => (v << 1) | bit, 0));
        }
        for (let pad = 0xec; data.length < dataCodewords; pad = pad === 0xec ? 0x11 : 0xec) {
            data.push(pad);
        }
        return data;
    }

    qrReedSolomon(data, ecCount) {
        const exp = new Array(512);
        const log = new Array(256);
        let x = 1;
        for (let i = 0; i < 255; i++) {
            exp[i] = x;
            log[x] = i;
            x <<= 1;
            if (x & 0x100) x ^= 0x11d;
        }
        for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];

        const mul = (a, b) => a && b ? exp[log[a] + log[b]] : 0;
        let gen = [1];
        for (let i = 0; i < ecCount; i++) {
            const next = new Array(gen.length + 1).fill(0);
            for (let j = 0; j < gen.length; j++) {
                next[j] ^= gen[j];
                next[j + 1] ^= mul(gen[j], exp[i]);
            }
            gen = next;
        }

        const res = new Array(ecCount).fill(0);
        for (const byte of data) {
            const factor = byte ^ res.shift();
            res.push(0);
            for (let i = 0; i < ecCount; i++) res[i] ^= mul(gen[i + 1], factor);
        }
        return res;
    }

    qrDrawFunctionPatterns(modules, reserved, spec) {
        const size = spec.size;
        const set = (x, y, dark, reserve = true) => {
            if (x < 0 || y < 0 || x >= size || y >= size) return;
            modules[y][x] = dark;
            if (reserve) reserved[y][x] = true;
        };
        const finder = (x, y) => {
            for (let dy = -1; dy <= 7; dy++) {
                for (let dx = -1; dx <= 7; dx++) {
                    const xx = x + dx, yy = y + dy;
                    const dark = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 &&
                        (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
                    set(xx, yy, dark);
                }
            }
        };
        finder(0, 0);
        finder(size - 7, 0);
        finder(0, size - 7);

        for (let i = 8; i < size - 8; i++) {
            set(i, 6, i % 2 === 0);
            set(6, i, i % 2 === 0);
        }
        for (const ax of spec.alignment) {
            for (const ay of spec.alignment) {
                if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) continue;
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
                    }
                }
            }
        }
        set(8, size - 8, true);
        for (let i = 0; i < 9; i++) {
            reserved[8][i] = true;
            reserved[i][8] = true;
            reserved[8][size - 1 - i] = true;
            reserved[size - 1 - i][8] = true;
        }
    }

    qrDrawVersionBits(modules, reserved, version) {
        const size = modules.length;
        let bits = version << 12;
        for (let i = 17; i >= 12; i--) {
            if ((bits >>> i) & 1) bits ^= 0x1f25 << (i - 12);
        }
        const versionBits = (version << 12) | bits;
        const get = i => ((versionBits >>> i) & 1) === 1;

        for (let i = 0; i < 18; i++) {
            const x1 = size - 11 + (i % 3);
            const y1 = Math.floor(i / 3);
            modules[y1][x1] = get(i);
            reserved[y1][x1] = true;

            const x2 = Math.floor(i / 3);
            const y2 = size - 11 + (i % 3);
            modules[y2][x2] = get(i);
            reserved[y2][x2] = true;
        }
    }

    qrDrawData(modules, reserved, bits) {
        const size = modules.length;
        let bitIndex = 0;
        let upward = true;
        for (let right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right--;
            for (let vert = 0; vert < size; vert++) {
                const y = upward ? size - 1 - vert : vert;
                for (let dx = 0; dx < 2; dx++) {
                    const x = right - dx;
                    if (reserved[y][x]) continue;
                    const raw = bitIndex < bits.length ? bits[bitIndex++] === 1 : false;
                    modules[y][x] = raw !== ((x + y) % 2 === 0);
                }
            }
            upward = !upward;
        }
    }

    qrDrawFormatBits(modules, reserved, mask) {
        const size = modules.length;
        const data = (1 << 3) | mask;
        let bits = data << 10;
        for (let i = 14; i >= 10; i--) {
            if ((bits >>> i) & 1) bits ^= 0x537 << (i - 10);
        }
        const format = (((data << 10) | bits) ^ 0x5412) & 0x7fff;
        const get = i => ((format >>> i) & 1) === 1;
        const set = (x, y, i) => {
            modules[y][x] = get(i);
            reserved[y][x] = true;
        };
        for (let i = 0; i <= 5; i++) set(8, i, i);
        set(8, 7, 6);
        set(8, 8, 7);
        set(7, 8, 8);
        for (let i = 9; i < 15; i++) set(14 - i, 8, i);
        for (let i = 0; i < 8; i++) set(size - 1 - i, 8, i);
        for (let i = 8; i < 15; i++) set(8, size - 15 + i, i);
    }
}

const app = new JellTogetherApp();
window.app = app;
window.showPollModal = () => app.showPollModal();
