class JellTogetherApp {
    constructor() {
        this.serverUrl = this.initialServerUrl();
        this.publicJellyfinUrl = "";
        this.publicCompanionOrigin = "";
        this.discordStageId = "";
        this.canSavePublicAccessSettings = false;
        this.enabledLibraryIds = [];
        this.allowQueueVotingByDefault = true;
        this.allowParticipantQueueAdds = true;
        this.pluginVersion = "1.4.0.2";
        this.changelog = [];
        this.currentRoom = null;
        this.currentUser = "Unknown";
        this.currentJellyfinMediaUserId = "";
        this.lastUpdate = new Date(0).toISOString();
        this.isPolling = false;
        this.pollTimer = null;
        this.reactionCount = 0;
        this.isVR = false;
        this.xrSession = null;
        this.xrSupported = false;
        this.xrDomOverlaySupported = false;
        this.xrMode = 'fallback';
        this.xrCanvas = null;
        this.xrGl = null;
        this.xrProgram = null;
        this.xrTexture = null;
        this.xrGeometryBuffer = null;
        this.xrFrameHandle = 0;
        this.xrRefSpace = null;
        this.xrLayer = null;
        this.theaterVideoItem = null;
        this.theaterVideoUrl = '';
        this.lang = 'en';
        this.t = JELL_TOGETHER_I18N[this.lang];
        this.activeSidebarTab = 'chat';
        this.replyTarget = null;
        this.authPromptShown = false;
        this.pendingInviteCode = "";
        this.queuePage = 1;
        this.queuePageSize = 10;
        this.mediaDetailsCache = new Map();

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
        this.pendingInviteCode = inviteCode || "";
        await this.loadSettings();
        await this.loadCurrentUser();
        await this.loadRooms();
        this.startLobbyPolling();
        this.checkVR();
        this.createStars();
        this.setupEventHandlers();
        if (inviteCode && this.currentUser !== "Unknown") this.joinByCode(inviteCode);
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

    initialServerUrl() {
        const injected = this.normalizeBaseUrl(window.JELL_TOGETHER_SERVER_URL || "");
        if (injected) return injected;
        const stored = this.normalizeBaseUrl(localStorage.getItem('jelltogether-server-url') || "");
        if (stored) return stored;
        return this.isLikelyJellyfinOrigin() ? window.location.origin : "";
    }

    isLikelyJellyfinOrigin() {
        return window.location.pathname.startsWith('/jelltogether') ||
            window.location.pathname.startsWith('/web/') ||
            window.location.pathname.includes('configurationpage');
    }

    normalizeBaseUrl(value) {
        let url = (value || "").trim().replace(/\/+$/, '');
        if (url && window.location.protocol === 'https:' && url.startsWith('http://')) {
            try {
                const parsed = new URL(url);
                if (parsed.host === window.location.host) {
                    url = 'https://' + url.substring(7);
                }
            } catch (e) {
                // Ignore URL parsing errors
            }
        }
        return url;
    }

    apiUrl(url) {
        if (!url || /^https?:\/\//i.test(url)) return url;
        if (!url.startsWith('/')) return url;
        return this.serverUrl ? `${this.serverUrl}${url}` : url;
    }

    companionUrl(code = null) {
        const base = this.publicCompanionOrigin ||
            (this.publicJellyfinUrl ? `${this.normalizeBaseUrl(this.publicJellyfinUrl)}/jelltogether/Companion` : `${window.location.origin}/jelltogether/Companion`);
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
            this.serverUrl = this.normalizeBaseUrl(this.publicJellyfinUrl || settings.serverUrl || this.serverUrl);
            if (this.serverUrl) localStorage.setItem('jelltogether-server-url', this.serverUrl);
            this.publicCompanionOrigin = settings.publicCompanionUrl || "";
            this.enabledLibraryIds = settings.enabledLibraryIds || [];
            this.allowQueueVotingByDefault = settings.allowQueueVotingByDefault !== false;
            this.allowParticipantQueueAdds = settings.allowParticipantQueueAdds !== false;
            this.discordStageId = settings.discordStageId || "";
            this.pluginVersion = settings.pluginVersion || this.pluginVersion;
            this.changelog = Array.isArray(settings.changelog) ? settings.changelog : [];
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
        this.updateVersionLabels();
        this.updateServerIndicator();
        this.updateDiscordStageActionState();
        await this.updateTheaterPlaybackSurface();
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

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && this.isVR && !this.xrSession) {
                this.setImmersiveMode(false);
            }
        });
    }

    generatedCompanionUrl(value = this.publicJellyfinUrl) {
        const base = this.normalizeBaseUrl(value || "");
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

    updateServerIndicator() {
        const trigger = document.getElementById('server-status-trigger');
        if (trigger) {
            trigger.title = this.serverUrl ? `Connected to ${this.serverUrl}` : 'Choose a Jellyfin server';
            trigger.classList.toggle('is-missing', !this.serverUrl);
        }

        const card = document.getElementById('connected-server-card');
        const display = document.getElementById('connected-server-display');
        if (display) {
            display.textContent = this.serverUrl ? this.serverDisplayName(this.serverUrl) : 'Not connected';
        }
        if (card) {
            card.title = this.serverUrl ? `Connected to ${this.serverUrl}` : 'Choose a Jellyfin server';
            card.classList.toggle('is-missing', !this.serverUrl);
        }
    }

    serverDisplayName(value) {
        try {
            const url = new URL(value);
            return url.host;
        } catch {
            return value || 'Unknown';
        }
    }

    showServerStatusModal() {
        this.hideModal();
        const overlay = document.createElement('div');
        overlay.id = 'app-modal-overlay';
        overlay.className = 'app-modal-overlay';
        
        const modal = document.createElement('div');
        modal.id = 'app-modal';
        modal.className = 'app-modal glass-card server-status-modal';
        
        const header = document.createElement('div');
        header.className = 'modal-header';
        
        const title = this.textEl('h3', '🌐 Server Connection');
        const subtitle = this.textEl('p', 'Your active companion backend connection status', 'modal-subtitle');
        header.appendChild(title);
        header.appendChild(subtitle);
        modal.appendChild(header);
        
        // Full Server Card inside the modal where it has plenty of space!
        const serverCard = document.createElement('div');
        serverCard.id = 'connected-server-card';
        serverCard.className = this.serverUrl ? 'server-card' : 'server-card is-missing';
        
        const info = document.createElement('div');
        info.className = 'server-card-info';
        const label = this.textEl('span', 'Connected Server URL', 'server-card-label');
        const display = this.textEl('span', this.serverUrl || 'Not connected', 'server-card-host');
        display.id = 'connected-server-display';
        info.appendChild(label);
        info.appendChild(display);
        serverCard.appendChild(info);
        modal.appendChild(serverCard);
        
        // Help text
        const helpText = document.createElement('p');
        helpText.className = 'server-status-help';
        if (this.serverUrl) {
            helpText.append(
                document.createTextNode('Companion is actively synced with the Jellyfin server at '),
                this.textEl('code', this.serverUrl),
                document.createTextNode('. Live watch party rooms and target active sessions are loaded from this address.')
            );
        } else {
            helpText.textContent = 'No connection has been configured. JellTogether requires an active link to a Jellyfin server to host and sync watch parties.';
        }
        modal.appendChild(helpText);
        
        const actionRow = document.createElement('div');
        actionRow.className = 'split-actions';
        
        actionRow.appendChild(this.button('Change Server', 'primary-command', () => {
            this.hideModal();
            this.showServerConnectionModal();
        }));
        actionRow.appendChild(this.button('Close', 'secondary-command', () => this.hideModal()));
        modal.appendChild(actionRow);
        
        overlay.onclick = (event) => { if (event.target === overlay) this.hideModal(); };
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Synchronize display indicators immediately
        this.updateServerIndicator();
    }

    showServerConnectionModal() {
        this.showModal('Connected Jellyfin Server', [
            { id: 'serverUrl', type: 'url', label: 'Server URL', placeholder: 'https://jellyfin.example.com', value: this.serverUrl || this.publicJellyfinUrl || '' }
        ], [
            { label: 'Update Server', primary: true, onClick: ({ serverUrl }) => this.updateConnectedServer(serverUrl) },
            { label: 'Clear Saved Server', danger: true, onClick: () => this.clearConnectedServer() }
        ]);
    }

    async updateConnectedServer(serverUrl) {
        const nextServerUrl = this.normalizeBaseUrl(serverUrl || "");
        if (!nextServerUrl) {
            this.showToast("Enter a Jellyfin server URL.", 'error');
            return;
        }

        this.serverUrl = nextServerUrl;
        localStorage.setItem('jelltogether-server-url', nextServerUrl);
        this.clearStoredAuth();
        this.currentRoom = null;
        this.currentUser = "Unknown";
        this.currentJellyfinMediaUserId = "";
        this.resetRenderCaches();
        this.updateServerIndicator();
        this.updateAuthAction();
        this.showToast("Server updated. Sign in to connect.", 'success');
        this.showJellyfinSignInModal();
    }

    async clearConnectedServer() {
        localStorage.removeItem('jelltogether-server-url');
        this.clearStoredAuth();
        this.serverUrl = this.isLikelyJellyfinOrigin() ? window.location.origin : "";
        this.currentRoom = null;
        this.currentUser = "Unknown";
        this.currentJellyfinMediaUserId = "";
        this.resetRenderCaches();
        this.updateServerIndicator();
        this.updateAuthAction();
        this.showToast("Saved server cleared.", 'success');
    }

    updateVersionLabels() {
        document.querySelectorAll('[data-plugin-version]').forEach(el => {
            el.textContent = this.versionLabel(this.pluginVersion);
        });
    }

    versionLabel(value = this.pluginVersion) {
        const label = value || this.pluginVersion;
        return String(label).toLowerCase().startsWith('v') || label === 'Earlier'
            ? label
            : `v${label}`;
    }

    showChangelogModal() {
        this.hideModal();

        const overlay = document.createElement('div');
        overlay.id = 'app-modal-overlay';
        overlay.className = 'app-modal-overlay';
        const modal = document.createElement('div');
        modal.id = 'app-modal';
        modal.className = 'app-modal glass-card changelog-modal';
        modal.appendChild(this.textEl('h3', 'JellTogether Changelog'));
        modal.appendChild(this.textEl('p', `Current version ${this.versionLabel(this.pluginVersion)}`, 'modal-subtitle'));

        const entries = document.createElement('div');
        entries.className = 'changelog-list';
        if (!this.changelog.length) {
            entries.appendChild(this.textEl('div', 'Sign in to load release notes.', 'loading'));
        }

        this.changelog.forEach(entry => {
            const card = document.createElement('article');
            card.className = 'changelog-entry';
            const heading = document.createElement('div');
            heading.className = 'changelog-entry-heading';
            heading.appendChild(this.textEl('strong', entry.title || 'Release'));
            heading.appendChild(this.textEl('span', this.versionLabel(entry.version || this.pluginVersion)));
            card.appendChild(heading);
            if (entry.date) card.appendChild(this.textEl('em', entry.date));

            const items = document.createElement('ul');
            (entry.items || []).forEach(item => {
                const li = document.createElement('li');
                li.textContent = item;
                items.appendChild(li);
            });
            card.appendChild(items);
            entries.appendChild(card);
        });
        modal.appendChild(entries);

        const actionRow = document.createElement('div');
        actionRow.className = 'split-actions';
        actionRow.appendChild(this.button('Close', 'secondary-command', () => this.hideModal()));
        modal.appendChild(actionRow);
        overlay.onclick = (event) => { if (event.target === overlay) this.hideModal(); };
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
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
        this.updateAuthAction();
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
        const targetUrl = this.apiUrl(url);
        const response = await fetch(targetUrl, {
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
            this.storedAuth()?.AccessToken,
            typeof apiClient?.accessToken === 'function' ? apiClient.accessToken() : apiClient?.accessToken,
            typeof apiClient?.getAccessToken === 'function' ? apiClient.getAccessToken() : null,
            apiClient?._serverInfo?.AccessToken,
            apiClient?._serverInfo?.AccessToken || apiClient?.serverInfo?.AccessToken
        ];

        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
        }

        return "";
    }

    storedAuth() {
        try {
            const raw = sessionStorage.getItem(this.authStorageKey());
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.error("Stored auth lookup failed:", e);
            return null;
        }
    }

    saveAuth(auth) {
        if (!auth?.AccessToken) return;
        sessionStorage.setItem(this.authStorageKey(), JSON.stringify({
            AccessToken: auth.AccessToken,
            User: auth.User || null,
            ServerId: auth.ServerId || '',
            savedAt: new Date().toISOString()
        }));
    }

    clearStoredAuth() {
        sessionStorage.removeItem(this.authStorageKey());
        localStorage.removeItem('jelltogether-auth');
    }

    authStorageKey() {
        return `jelltogether-auth:${this.serverUrl || window.location.origin}`;
    }

    showSignInPrompt() {
        if (this.authPromptShown) return;
        this.authPromptShown = true;
        this.showToast("Sign in to Jellyfin to use JellTogether.", 'error');
        this.showJellyfinSignInModal();
    }

    showJellyfinSignInModal() {
        const fields = [];
        if (!this.serverUrl || !this.isLikelyJellyfinOrigin()) {
            fields.push({ id: 'serverUrl', type: 'url', label: 'Jellyfin server URL', placeholder: 'https://jellyfin.example.com', value: this.serverUrl || this.publicJellyfinUrl || '' });
        }
        fields.push(
            { id: 'username', type: 'text', label: 'Username', placeholder: 'Jellyfin username' },
            { id: 'password', type: 'password', label: 'Password', placeholder: 'Jellyfin password' }
        );

        this.showModal('Sign in to Jellyfin', fields, [
            { label: 'Sign In', primary: true, onClick: (values) => this.signInToJellyfin(values) }
        ]);
    }

    async signInToJellyfin({ serverUrl, username, password }) {
        const nextServerUrl = this.normalizeBaseUrl(serverUrl || this.serverUrl || this.publicJellyfinUrl || "");
        if (nextServerUrl) {
            if (!this.isSecureServerUrl(nextServerUrl)) {
                this.showToast("Use HTTPS for public Jellyfin sign-in URLs.", 'error');
                this.authPromptShown = false;
                this.showJellyfinSignInModal();
                return;
            }
            this.serverUrl = nextServerUrl;
            localStorage.setItem('jelltogether-server-url', nextServerUrl);
            this.updateServerIndicator();
        }

        const name = (username || '').trim();
        if (!name || !password) {
            this.showToast("Enter your Jellyfin username and password.", 'error');
            this.authPromptShown = false;
            this.showJellyfinSignInModal();
            return;
        }

        try {
            const response = await fetch(this.apiUrl('/Users/AuthenticateByName'), {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.jellyfinAuthorizationHeader()
                },
                body: JSON.stringify({ Username: name, Pw: password })
            });

            if (!response.ok) throw new Error(`Sign in failed with ${response.status}`);
            const auth = await response.json();
            this.saveAuth(auth);
            this.authPromptShown = false;
            this.showToast("Signed in to Jellyfin.", 'success');
            await this.reloadAfterSignIn();
        } catch (e) {
            console.error("Jellyfin Sign In Error:", e);
            this.showToast("Sign in failed. Check your Jellyfin credentials.", 'error');
            this.authPromptShown = false;
            this.showJellyfinSignInModal();
        }
    }

    jellyfinAuthorizationHeader() {
        const deviceId = this.deviceId();
        return `MediaBrowser Client="JellTogether Companion", Device="Browser", DeviceId="${deviceId}", Version="${this.pluginVersion}"`;
    }

    isSecureServerUrl(value) {
        try {
            const parsed = new URL(value);
            return parsed.protocol === 'https:' ||
                parsed.hostname === 'localhost' ||
                parsed.hostname === '127.0.0.1' ||
                parsed.hostname === '::1' ||
                parsed.hostname.endsWith('.local');
        } catch {
            return false;
        }
    }

    deviceId() {
        const key = 'jelltogether-device-id';
        let id = localStorage.getItem(key);
        if (!id) {
            id = (crypto?.randomUUID?.() || `jelltogether-${Date.now()}-${Math.random().toString(16).slice(2)}`);
            localStorage.setItem(key, id);
        }
        return id;
    }

    async reloadAfterSignIn() {
        await this.loadSettings();
        await this.loadCurrentUser();
        await this.loadRooms();
        if (this.pendingInviteCode) await this.joinByCode(this.pendingInviteCode);
    }

    async signOut() {
        this.clearStoredAuth();
        this.authPromptShown = false;
        this.currentUser = "Unknown";
        this.currentJellyfinMediaUserId = "";
        this.currentRoom = null;
        this.pendingInviteCode = this.getInviteCodeFromUrl() || "";
        this.queuePage = 1;
        this.resetRenderCaches();
        this.hideModal();

        const display = document.getElementById('display-name');
        if (display) display.textContent = 'Signed out';
        this.updateAuthAction();
        this.updateServerIndicator();
        const lobby = document.getElementById('lobby-view');
        const party = document.getElementById('party-view');
        if (lobby) lobby.style.display = 'block';
        if (party) party.style.display = 'none';
        this.showToast("Signed out of the companion.", 'success');
    }

    handleAuthAction() {
        if (!this.currentUser || this.currentUser === "Unknown") {
            this.showJellyfinSignInModal();
            return;
        }

        this.signOut();
    }

    updateAuthAction() {
        const button = document.getElementById('btn-auth-action');
        if (!button) return;
        button.textContent = (!this.currentUser || this.currentUser === "Unknown") ? 'Sign In' : 'Sign Out';
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

    iconSvg(paths, viewBox = '0 0 24 24', size = 14) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', viewBox);
        svg.setAttribute('width', String(size));
        svg.setAttribute('height', String(size));
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2.5');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        paths.forEach(path => {
            const node = document.createElementNS('http://www.w3.org/2000/svg', path.tag);
            Object.entries(path.attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
            svg.appendChild(node);
        });
        return svg;
    }

    infoIcon() {
        return this.iconSvg([
            { tag: 'circle', attrs: { cx: 12, cy: 12, r: 10 } },
            { tag: 'line', attrs: { x1: 12, y1: 16, x2: 12, y2: 12 } },
            { tag: 'line', attrs: { x1: 12, y1: 8, x2: 12.01, y2: 8 } }
        ]);
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
            addedBy: this.prop(item, 'addedBy', null, 'Unknown'),
            year: this.prop(item, 'year', null, ''),
            seriesId: this.prop(item, 'seriesId', null, ''),
            seriesName: this.prop(item, 'seriesName', null, ''),
            seasonId: this.prop(item, 'seasonId', null, ''),
            seasonName: this.prop(item, 'seasonName', null, ''),
            parentId: this.prop(item, 'parentId', null, '')
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
            source: this.prop(message, 'source', null, 'jelltogether'),
            externalMessageId: this.prop(message, 'externalMessageId', null, ''),
            timestamp: this.prop(message, 'timestamp', null, '')
        };
    }

    normalizePlaybackTarget(target) {
        return {
            ...target,
            sessionId: this.prop(target, 'sessionId', null, ''),
            userId: this.prop(target, 'userId', null, ''),
            userName: this.prop(target, 'userName', null, ''),
            matchedParticipantId: this.prop(target, 'matchedParticipantId', null, ''),
            matchReason: this.prop(target, 'matchReason', null, ''),
            client: this.prop(target, 'client', null, ''),
            deviceName: this.prop(target, 'deviceName', null, ''),
            isActive: this.prop(target, 'isActive', null, false) === true,
            supportsRemoteControl: this.prop(target, 'supportsRemoteControl', null, false) === true,
            supportsMediaControl: this.prop(target, 'supportsMediaControl', null, false) === true,
            isCurrentUser: this.prop(target, 'isCurrentUser', null, false) === true,
            isAndroidTv: this.prop(target, 'isAndroidTv', null, false) === true,
            canStartPlayback: this.prop(target, 'canStartPlayback', null, false) === true,
            eligibilityReason: this.prop(target, 'eligibilityReason', null, '')
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
            participantProfiles: this.prop(room, 'participantProfiles', null, {}),
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
        if (this.targetsPollInterval) {
            clearInterval(this.targetsPollInterval);
            this.targetsPollInterval = null;
        }
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
            meta.appendChild(this.textEl('span', this.versionLabel(this.pluginVersion)));
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
            if (this.isVR || this.xrSession) await this.exitImmersiveMode();
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
        const clearQueueBtn = document.getElementById('btn-clear-queue');
        if (clearQueueBtn) {
            clearQueueBtn.style.display = this.canManage() && this.currentRoom.queue.length ? 'inline-flex' : 'none';
            clearQueueBtn.disabled = !this.currentRoom.queue.length;
        }

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
        await this.showMediaDetails(item, { backToSearch: true });
    }

    async showMediaDetails(item, options = {}) {
        if (!item?.mediaId) return;
        this.hideModal();

        const overlay = document.createElement('div');
        overlay.id = 'app-modal-overlay';
        overlay.className = 'app-modal-overlay';
        const modal = document.createElement('div');
        modal.id = 'app-modal';
        modal.className = 'app-modal glass-card media-detail-modal';
        modal.appendChild(this.textEl('div', 'Loading media details...', 'loading'));
        overlay.onclick = (event) => { if (event.target === overlay) this.hideModal(); };
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        try {
            const details = await this.fetchMediaDetails(item);
            this.renderMediaDetails(modal, details, options);
        } catch (e) {
            console.error('Media Details Error:', e);
            this.renderMediaDetails(modal, item, options);
            this.showToast("Some media details could not be loaded.", 'error');
        }
    }

    async fetchMediaDetails(item) {
        const key = item.mediaId;
        if (this.mediaDetailsCache.has(key)) return { ...item, ...this.mediaDetailsCache.get(key) };

        const userId = this.currentJellyfinUserId();
        if (!userId || !item.mediaId) return item;
        const params = new URLSearchParams({
            Fields: 'Overview,Genres,People,Studios,Tags,ProviderIds,RunTimeTicks,CommunityRating,OfficialRating,PremiereDate,ProductionYear,ParentId,SeriesId,SeasonId,ImageTags,MediaSources'
        });
        const data = await this.fetchJson(`/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(item.mediaId)}?${params}`);
        const details = this.normalizeMediaDetails(data, item);
        this.mediaDetailsCache.set(key, details);
        return details;
    }

    normalizeMediaDetails(data, fallback = {}) {
        const type = data.Type || data.type || fallback.mediaType || '';
        const people = data.People || data.people || [];
        const cast = people
            .filter(person => String(person.Type || person.type || '').toLowerCase() === 'actor')
            .slice(0, 8)
            .map(person => [person.Name || person.name, person.Role || person.role].filter(Boolean).join(' as '))
            .filter(Boolean);

        return {
            ...fallback,
            title: this.mediaTitle(data) || fallback.title || 'Untitled item',
            mediaId: data.Id || data.id || fallback.mediaId || '',
            mediaType: type,
            overview: data.Overview || data.overview || fallback.overview || '',
            year: data.ProductionYear || data.productionYear || fallback.year || '',
            runtimeTicks: data.RunTimeTicks || data.runTimeTicks || 0,
            communityRating: data.CommunityRating || data.communityRating || '',
            officialRating: data.OfficialRating || data.officialRating || '',
            genres: data.Genres || data.genres || [],
            cast,
            seriesId: data.SeriesId || data.seriesId || fallback.seriesId || '',
            seriesName: data.SeriesName || data.seriesName || fallback.seriesName || '',
            seasonId: data.SeasonId || data.seasonId || fallback.seasonId || '',
            seasonName: data.SeasonName || data.seasonName || fallback.seasonName || '',
            parentId: data.ParentId || data.parentId || fallback.parentId || '',
            mediaSourceId: Array.isArray(data.MediaSources || data.mediaSources) ? ((data.MediaSources || data.mediaSources)[0]?.Id || (data.MediaSources || data.mediaSources)[0]?.id || '') : ''
        };
    }

    renderMediaDetails(modal, item, options = {}) {
        this.clear(modal);
        modal.className = 'app-modal glass-card media-detail-modal';

        const header = document.createElement('div');
        header.className = 'media-detail-header';
        const poster = document.createElement('div');
        poster.className = 'media-detail-poster';
        const img = document.createElement('img');
        img.alt = '';
        img.src = this.posterUrl(item.mediaId, 360, 240);
        img.onerror = () => poster.classList.add('is-empty');
        poster.appendChild(img);
        header.appendChild(poster);

        const copy = document.createElement('div');
        copy.className = 'media-detail-copy';
        copy.appendChild(this.textEl('h3', item.title || 'Untitled item'));
        const meta = [
            item.mediaType,
            item.year,
            this.formatRuntime(item.runtimeTicks),
            item.officialRating,
            item.communityRating ? `${Number(item.communityRating).toFixed(1)} stars` : ''
        ].filter(Boolean);
        copy.appendChild(this.textEl('p', meta.join(' • ') || 'Jellyfin item', 'modal-subtitle'));
        if (item.genres?.length) copy.appendChild(this.textEl('p', item.genres.slice(0, 5).join(' • '), 'media-detail-meta'));
        header.appendChild(copy);
        modal.appendChild(header);

        modal.appendChild(this.textEl('p', item.overview || 'No synopsis is available for this item.', 'media-detail-overview'));
        if (item.cast?.length) {
            modal.appendChild(this.textEl('h4', 'Cast'));
            modal.appendChild(this.textEl('p', item.cast.join(' • '), 'media-detail-meta'));
        }

        const optionsWrap = document.createElement('div');
        optionsWrap.className = 'queue-add-options';
        if (this.currentRoom && this.canAddQueue()) {
            if (this.isDirectQueueItem(item)) {
                optionsWrap.appendChild(this.button('Add This Item', 'primary-command', () => this.addMediaToQueue(item)));
            } else {
                optionsWrap.appendChild(this.textEl('div', 'Choose the playable items below to add this title to the queue.', 'media-detail-note'));
            }
            optionsWrap.appendChild(this.textEl('div', 'Looking for seasons, episodes, and collections...', 'loading queue-options-loading'));
        }
        modal.appendChild(optionsWrap);

        const actionRow = document.createElement('div');
        actionRow.className = 'split-actions';
        if (options.backToSearch) actionRow.appendChild(this.button('Back to Search', 'secondary-command', () => this.showQueueSearchModal()));
        actionRow.appendChild(this.button('Close', 'secondary-command', () => this.hideModal()));
        modal.appendChild(actionRow);

        if (!this.currentRoom || !this.canAddQueue()) return;
        this.queueGroupOptions(item).then(groupOptions => {
            optionsWrap.querySelector('.queue-options-loading')?.remove();
            if (!groupOptions.length) return;
            groupOptions.forEach(option => {
                const row = document.createElement('div');
                row.className = 'queue-option-row';
                row.appendChild(this.textEl('span', `${option.label} (${option.items.length})`));
                row.appendChild(this.button('Choose', 'secondary-command compact', () => this.showQueueGroupPicker(option, item, options)));
                row.appendChild(this.button('Add All', 'micro-command primary', () => this.addMediaGroupToQueue(option.items, option.successMessage)));
                optionsWrap.appendChild(row);
            });
        }).catch(e => {
            console.warn('Queue options lookup failed:', e);
            optionsWrap.querySelector('.queue-options-loading')?.remove();
        });
    }

    posterUrl(mediaId, height = 420, width = 280) {
        if (!mediaId) return '';
        const token = this.getAccessToken();
        const tokenParam = token ? `&api_key=${encodeURIComponent(token)}` : '';
        return this.apiUrl(`/Items/${encodeURIComponent(mediaId)}/Images/Primary?fillHeight=${height}&fillWidth=${width}&quality=90${tokenParam}`);
    }

    formatRuntime(ticks) {
        const totalMinutes = Math.round(Number(ticks || 0) / 600000000);
        if (!totalMinutes) return '';
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
    }

    isDirectQueueItem(item) {
        const type = String(item?.mediaType || '').toLowerCase();
        return type === 'movie' || type === 'episode';
    }

    showQueueGroupPicker(option, sourceItem = null, previousOptions = {}) {
        this.hideModal();

        const overlay = document.createElement('div');
        overlay.id = 'app-modal-overlay';
        overlay.className = 'app-modal-overlay';
        const modal = document.createElement('div');
        modal.id = 'app-modal';
        modal.className = 'app-modal glass-card queue-picker-modal';
        modal.appendChild(this.textEl('h3', option.label));
        modal.appendChild(this.textEl('p', 'Choose the movies, seasons, or episodes to add.', 'modal-subtitle'));

        const pickerTools = document.createElement('div');
        pickerTools.className = 'queue-picker-tools';
        pickerTools.appendChild(this.button('Select All', 'micro-command primary', () => {
            list.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = true; });
        }));
        pickerTools.appendChild(this.button('Deselect All', 'micro-command', () => {
            list.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = false; });
        }));
        modal.appendChild(pickerTools);

        const list = document.createElement('div');
        list.className = 'queue-picker-list';
        option.items.forEach(item => {
            const label = document.createElement('label');
            label.className = 'queue-picker-item';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = true;
            input.value = item.mediaId;
            label.appendChild(input);
            const text = document.createElement('span');
            text.appendChild(this.textEl('strong', item.title));
            text.appendChild(this.textEl('em', [item.mediaType, item.year].filter(Boolean).join(' • ') || 'Jellyfin item'));
            label.appendChild(text);
            list.appendChild(label);
        });
        modal.appendChild(list);

        const actionRow = document.createElement('div');
        actionRow.className = 'split-actions';
        actionRow.appendChild(this.button('Add Selected', 'primary-command', () => {
            const selected = [...list.querySelectorAll('input:checked')].map(input => option.items.find(item => item.mediaId === input.value)).filter(Boolean);
            if (!selected.length) {
                this.showToast("Choose at least one item to add.", 'error');
                return;
            }
            this.addMediaGroupToQueue(selected, `${selected.length} item${selected.length === 1 ? '' : 's'} added to queue.`);
        }));
        if (sourceItem) actionRow.appendChild(this.button('Back', 'secondary-command', () => this.showMediaDetails(sourceItem, previousOptions)));
        actionRow.appendChild(this.button('Close', 'secondary-command', () => this.hideModal()));
        modal.appendChild(actionRow);

        overlay.onclick = (event) => { if (event.target === overlay) this.hideModal(); };
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
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
            const seasons = await this.fetchSeasonOptionsForSeries(item.mediaId, item.libraryId);
            seasons.forEach(season => {
                if (!options.some(option => option.key === season.key)) options.push(season);
            });
        } else if (type === 'boxset') {
            await addOption(`collection-${item.mediaId}`, `Add ${item.title}`, item.mediaId, 'Movie,Episode', 'Collection added to queue.');
        } else if (type === 'movie') {
            const collections = await this.findCollectionsForItem(item);
            collections.forEach(collection => options.push(collection));
        }

        return options;
    }

    async fetchSeasonOptionsForSeries(seriesId, libraryId = '') {
        const userId = this.currentJellyfinUserId();
        if (!userId || !seriesId) return [];
        const params = new URLSearchParams({
            ParentId: seriesId,
            Recursive: 'false',
            IncludeItemTypes: 'Season',
            SortBy: 'IndexNumber,SortName',
            SortOrder: 'Ascending',
            Fields: 'Overview,ParentId',
            Limit: '100'
        });
        const data = await this.fetchJson(`/Users/${encodeURIComponent(userId)}/Items?${params}`);
        const seasons = data.Items || data.items || [];
        const options = [];
        for (const season of seasons) {
            const seasonId = season.Id || season.id || '';
            const seasonName = season.Name || season.name || 'Season';
            const items = await this.fetchQueueGroupItems(seasonId, 'Episode', libraryId);
            if (items.length) {
                options.push({
                    key: `season-${seasonId}`,
                    label: `Choose ${seasonName}`,
                    items,
                    successMessage: `${seasonName} added to queue.`
                });
            }
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
            Fields: 'Overview,ParentId,SeriesId,SeasonId,RunTimeTicks,ProductionYear',
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
                overview: item.Overview || item.overview || '',
                year: item.ProductionYear || item.productionYear || '',
                parentId: item.ParentId || item.parentId || ''
            }];
        }

        return [{
            title: this.mediaTitle(item),
            mediaId: item.Id || item.id || '',
            libraryId,
            mediaType: type,
            overview: item.Overview || item.overview || '',
            year: item.ProductionYear || item.productionYear || '',
            seriesId: item.SeriesId || item.seriesId || '',
            seriesName: item.SeriesName || item.seriesName || '',
            seasonId: item.SeasonId || item.seasonId || '',
            seasonName: item.SeasonName || item.seasonName || '',
            parentId: item.ParentId || item.parentId || ''
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
                const members = await this.fetchQueueGroupItems(collectionId, 'Movie,Episode', item.libraryId);
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
        const dataStr = JSON.stringify({ queue: this.currentRoom.queue, page: this.queuePage });
        if (dataStr === this._lastQueueData) return;
        this._lastQueueData = dataStr;

        const container = document.getElementById('queue-panel');
        this.clear(container);
        if (!this.currentRoom.queue.length) {
            container.appendChild(this.textEl('div', 'Queue is empty.', 'loading'));
            return;
        }

        const totalPages = Math.max(1, Math.ceil(this.currentRoom.queue.length / this.queuePageSize));
        this.queuePage = Math.min(Math.max(this.queuePage, 1), totalPages);
        const start = (this.queuePage - 1) * this.queuePageSize;
        const visibleItems = this.currentRoom.queue.slice(start, start + this.queuePageSize);

        visibleItems.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'queue-item';
            const content = document.createElement('div');
            content.className = 'queue-item-content';
            content.role = 'button';
            content.tabIndex = 0;
            content.title = 'View media details';
            content.onclick = () => this.showMediaDetails(item);
            content.onkeydown = (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    this.showMediaDetails(item);
                }
            };
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

        if (totalPages > 1) {
            const pager = document.createElement('div');
            pager.className = 'queue-pager';
            const previous = this.button('Previous', 'micro-command', () => this.setQueuePage(this.queuePage - 1));
            previous.disabled = this.queuePage <= 1;
            const next = this.button('Next', 'micro-command', () => this.setQueuePage(this.queuePage + 1));
            next.disabled = this.queuePage >= totalPages;
            pager.appendChild(previous);
            pager.appendChild(this.textEl('span', `Page ${this.queuePage} of ${totalPages}`));
            pager.appendChild(next);
            container.appendChild(pager);
        }
    }

    setQueuePage(page) {
        const totalPages = Math.max(1, Math.ceil((this.currentRoom?.queue?.length || 0) / this.queuePageSize));
        this.queuePage = Math.min(Math.max(page, 1), totalPages);
        this._lastQueueData = null;
        this.renderQueue();
    }

    renderPlayerState() {
        const title = document.getElementById('now-playing-title');
        if (!title || !this.currentRoom) return;
        title.textContent = this.currentRoom.nowPlayingTitle
            ? `Now playing: ${this.currentRoom.nowPlayingTitle}`
            : 'No synced media selected';

        const screen = document.getElementById('theater-screen');
        if (screen) {
            const canControl = this.canControlPlayback();
            screen.disabled = !canControl;
            screen.classList.toggle('is-clickable', canControl);
            screen.classList.toggle('is-playing', Boolean(this.currentRoom.nowPlayingTitle));
            screen.title = canControl ? 'Open theater controls' : 'Only hosts or playback-enabled participants can control the theater screen';
        }
        this.updateTheaterPlaybackSurface();
    }

    async showTheaterControls() {
        if (!this.currentRoom) return;
        if (!this.canControlPlayback()) {
            this.showToast("Only hosts or playback-enabled participants can control the theater screen.", 'error');
            return;
        }

        this.hideModal();

        const overlay = document.createElement('div');
        overlay.id = 'app-modal-overlay';
        overlay.className = 'app-modal-overlay';
        const modal = document.createElement('div');
        modal.id = 'app-modal';
        modal.className = 'app-modal glass-card theater-control-modal';
        modal.appendChild(this.textEl('h3', 'Theater Controls'));
        modal.appendChild(this.textEl('p', this.currentRoom.nowPlayingTitle ? `Now playing: ${this.currentRoom.nowPlayingTitle}` : 'Choose queued media or search Jellyfin to start the watch party.', 'modal-subtitle'));

        const grid = document.createElement('div');
        grid.className = 'theater-control-grid';
        const playableQueue = (this.currentRoom.queue || []).filter(item => item.mediaId);

        if (playableQueue.length) {
            const queueCard = document.createElement('section');
            queueCard.className = 'theater-control-card';
            queueCard.appendChild(this.textEl('strong', 'Start From Queue'));
            queueCard.appendChild(this.textEl('span', `${playableQueue.length} playable item${playableQueue.length === 1 ? '' : 's'} ready`));
            const list = document.createElement('div');
            list.className = 'theater-queue-list';
            playableQueue.slice(0, 5).forEach(item => {
                list.appendChild(this.button(item.title, 'micro-command', () => this.showStartWatchPartyModal(item)));
            });
            queueCard.appendChild(list);
            grid.appendChild(queueCard);
        }

        const searchCard = document.createElement('section');
        searchCard.className = 'theater-control-card';
        searchCard.appendChild(this.textEl('strong', 'Find Media'));
        searchCard.appendChild(this.textEl('span', 'Search allowed Jellyfin libraries and add something to Up Next.'));
        searchCard.appendChild(this.button('Search Jellyfin', 'primary-command', () => this.showQueueSearchModal()));
        grid.appendChild(searchCard);

        const targetCard = document.createElement('section');
        targetCard.className = 'theater-control-card';
        targetCard.appendChild(this.textEl('strong', 'Playback Targets'));
        targetCard.appendChild(this.textEl('span', 'Check which room devices can be started remotely.'));
        targetCard.appendChild(this.button('View Targets', 'secondary-command', () => this.showPlaybackTargetsModal()));
        grid.appendChild(targetCard);

        modal.appendChild(grid);
        const actionRow = document.createElement('div');
        actionRow.className = 'split-actions';
        actionRow.appendChild(this.button('Close', 'secondary-command', () => this.hideModal()));
        modal.appendChild(actionRow);
        overlay.onclick = (event) => { if (event.target === overlay) this.hideModal(); };
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    async updateTheaterPlaybackSurface() {
        const screen = document.getElementById('theater-screen');
        const video = document.getElementById('theater-video');
        if (!screen || !video || !this.currentRoom) return;

        const activeItem = this.currentRoom.queue?.find(item => item.mediaId && item.mediaId === this.currentRoom.nowPlayingMediaId);
        if (!activeItem || !this.currentRoom.nowPlayingTitle) {
            this.stopTheaterVideo(video, screen);
            return;
        }

        const details = await this.fetchMediaDetails(activeItem).catch(() => activeItem);
        const mediaSourceUrl = this.playbackStreamUrl(details);
        if (!mediaSourceUrl) {
            this.stopTheaterVideo(video, screen);
            return;
        }

        if (this.theaterVideoItem !== activeItem.mediaId || this.theaterVideoUrl !== mediaSourceUrl) {
            this.theaterVideoItem = activeItem.mediaId;
            this.theaterVideoUrl = mediaSourceUrl;
            video.src = mediaSourceUrl;
            video.hidden = false;
            video.oncanplay = () => {
                const currentSeconds = this.currentRoom?.nowPlayingStartedAt
                    ? Math.max(0, (Date.now() - new Date(this.currentRoom.nowPlayingStartedAt).getTime()) / 1000)
                    : 0;
                if (Number.isFinite(currentSeconds) && currentSeconds > 0) {
                    try { video.currentTime = currentSeconds; } catch (e) { /* ignore */ }
                }
                video.play?.().catch(() => {});
            };
            video.onerror = () => this.stopTheaterVideo(video, screen);
            screen.classList.add('is-playing');
        }
    }

    stopTheaterVideo(video, screen = null) {
        if (video) {
            try { video.pause(); } catch (e) { /* ignore */ }
            video.removeAttribute('src');
            video.load?.();
            video.hidden = true;
        }
        this.theaterVideoItem = null;
        this.theaterVideoUrl = '';
        if (screen) screen.classList.remove('is-playing');
    }

    playbackStreamUrl(item) {
        if (!item?.mediaId) return '';
        const token = this.getAccessToken();
        const mediaSourceId = item.mediaSourceId || '';
        const sourceParam = mediaSourceId ? `&mediaSourceId=${encodeURIComponent(mediaSourceId)}` : '';
        const startTicks = this.currentRoom?.nowPlayingStartedAt
            ? Math.max(0, Math.round((Date.now() - new Date(this.currentRoom.nowPlayingStartedAt).getTime()) * 10000))
            : 0;
        const startParam = startTicks > 0 ? `&startTimeTicks=${startTicks}` : '';
        return this.apiUrl(`/Videos/${encodeURIComponent(item.mediaId)}/stream?static=true${sourceParam}${startParam}${token ? `&api_key=${encodeURIComponent(token)}` : ''}`);
    }

    async showPlaybackTargetsModal() {
        if (!this.currentRoom || !this.canControlPlayback()) return;
        this.hideModal();

        const overlay = document.createElement('div');
        overlay.id = 'app-modal-overlay';
        overlay.className = 'app-modal-overlay';
        const modal = document.createElement('div');
        modal.id = 'app-modal';
        modal.className = 'app-modal glass-card playback-modal';
        modal.appendChild(this.textEl('h3', 'Playback Targets'));
        modal.appendChild(this.textEl('p', 'Active Jellyfin sessions that can receive watch party playback.', 'modal-subtitle'));

        const targetList = document.createElement('div');
        targetList.className = 'playback-target-list';
        targetList.appendChild(this.textEl('div', 'Finding active Jellyfin sessions...', 'loading'));
        modal.appendChild(targetList);

        const actionRow = document.createElement('div');
        actionRow.className = 'split-actions';
        actionRow.appendChild(this.button('Refresh', 'secondary-command', () => refresh()));
        actionRow.appendChild(this.button('Close', 'secondary-command', () => this.hideModal()));
        modal.appendChild(actionRow);

        overlay.onclick = (event) => { if (event.target === overlay) this.hideModal(); };
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const refresh = async () => {
            try {
                const targets = await this.fetchJson(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/PlaybackTargets`);
                this.renderPlaybackTargetSummary(targetList, targets || []);
            } catch (e) {
                console.error("Playback Target Summary Error:", e);
                targetList.replaceChildren(this.textEl('div', 'Could not load active Jellyfin sessions.', 'loading'));
            }
        };

        await refresh();
        this.targetsPollInterval = setInterval(refresh, 5000);
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
        const startButton = this.button('Start', 'primary-command', () => {
            const selected = this.selectedPlaybackTargets(targetList);
            this.hideModal();
            this.startWatchParty(item.id, selected);
        });
        startButton.disabled = true;

        actionRow.appendChild(this.button('Refresh', 'secondary-command', () => refresh()));
        actionRow.appendChild(startButton);
        actionRow.appendChild(this.button('Close', 'secondary-command', () => this.hideModal()));
        modal.appendChild(actionRow);

        overlay.onclick = (event) => { if (event.target === overlay) this.hideModal(); };
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const refresh = async () => {
            try {
                const targets = await this.fetchJson(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/PlaybackTargets`);
                const previouslySelected = new Set(this.selectedPlaybackTargets(targetList));
                this.renderPlaybackTargets(targetList, targets || [], startButton, () => this.showStartWatchPartyModal(item));
                
                if (previouslySelected.size > 0) {
                    targetList.querySelectorAll('input[type="checkbox"]').forEach(input => {
                        input.checked = previouslySelected.has(input.value);
                    });
                    startButton.disabled = this.selectedPlaybackTargets(targetList).length === 0;
                }
            } catch (e) {
                console.error("Playback Targets Error:", e);
                targetList.replaceChildren(this.textEl('div', 'Could not load active Jellyfin sessions.', 'loading'));
            }
        };

        await refresh();
        this.targetsPollInterval = setInterval(refresh, 5000);
    }

    renderPlaybackTargetSummary(container, targets) {
        this.clear(container);
        targets = (targets || []).map(target => this.normalizePlaybackTarget(target));
        if (!targets.length) {
            this.renderTargetHelpInstructions(container);
            return;
        }

        targets.forEach(target => {
            const row = document.createElement('div');
            row.className = target.canStartPlayback ? 'playback-target target-summary is-ready' : 'playback-target target-summary';
            
            const text = document.createElement('span');
            const title = document.createElement('strong');
            title.textContent = target.userName || target.userId || 'Jellyfin user';
            if (target.isAndroidTv) title.appendChild(this.textEl('span', 'Android TV', 'target-badge'));
            text.appendChild(title);
            text.appendChild(this.textEl('em', [target.client, target.deviceName, target.eligibilityReason].filter(Boolean).join(' • ') || 'Active session'));
            row.appendChild(text);
            
            // Inline Action wrapper (info button + hover tooltip)
            const actionWrapper = document.createElement('div');
            actionWrapper.className = 'target-info-wrapper';
            
            const infoBtn = document.createElement('button');
            infoBtn.className = 'target-info-btn';
            infoBtn.type = 'button';
            infoBtn.appendChild(this.infoIcon());
            
            // Hover Tooltip Card
            const tooltip = document.createElement('div');
            tooltip.className = 'target-hover-tooltip glass-card';
            
            const tooltipTitle = document.createElement('h5');
            tooltipTitle.textContent = "🔌 Connection Checklist";
            tooltip.appendChild(tooltipTitle);
            
            const tooltipList = document.createElement('ul');
            tooltipList.className = 'tooltip-checklist';
            
            const criteria = [
                { name: "Awake & Active", ok: target.isActive },
                { name: "Remote Commands", ok: target.supportsRemoteControl },
                { name: "Media Controls", ok: target.supportsMediaControl || (target.isAndroidTv && target.canStartPlayback) }
            ];
            
            criteria.forEach(item => {
                const li = document.createElement('li');
                li.className = item.ok ? 'checklist-item is-ok' : 'checklist-item is-fail';
                li.appendChild(this.textEl('span', item.ok ? '🟢' : '🔴'));
                li.appendChild(this.textEl('strong', item.name));
                tooltipList.appendChild(li);
            });
            tooltip.appendChild(tooltipList);
            
            const tooltipHint = document.createElement('div');
            tooltipHint.className = 'tooltip-hint';
            tooltipHint.textContent = "Click for full troubleshooting guide";
            tooltip.appendChild(tooltipHint);
            
            actionWrapper.appendChild(infoBtn);
            actionWrapper.appendChild(tooltip);
            
            infoBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showTargetDetailsModal(target, () => this.showPlaybackTargetsModal());
            });

            row.appendChild(actionWrapper);
            row.appendChild(this.textEl('span', target.canStartPlayback ? 'Ready' : 'Unavailable', target.canStartPlayback ? 'target-state ready' : 'target-state'));
            container.appendChild(row);
        });
    }

    renderPlaybackTargets(container, targets, startButton, backAction) {
        this.clear(container);
        targets = (targets || []).map(target => this.normalizePlaybackTarget(target));
        if (!targets.length) {
            this.renderTargetHelpInstructions(container);
            startButton.disabled = true;
            return;
        }

        targets.forEach(target => {
            const isEligible = target.canStartPlayback || (target.isActive && target.supportsRemoteControl && target.supportsMediaControl);
            
            const label = document.createElement('label');
            label.className = isEligible ? 'playback-target' : 'playback-target target-summary-disabled';
            
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = target.sessionId;
            input.checked = isEligible;
            input.disabled = !isEligible;
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

            // Inline Action wrapper (info button + hover tooltip)
            const actionWrapper = document.createElement('div');
            actionWrapper.className = 'target-info-wrapper';
            
            const infoBtn = document.createElement('button');
            infoBtn.className = 'target-info-btn';
            infoBtn.type = 'button';
            infoBtn.appendChild(this.infoIcon());
            
            const tooltip = document.createElement('div');
            tooltip.className = 'target-hover-tooltip glass-card';
            
            const tooltipTitle = document.createElement('h5');
            tooltipTitle.textContent = "🔌 Connection Checklist";
            tooltip.appendChild(tooltipTitle);
            
            const tooltipList = document.createElement('ul');
            tooltipList.className = 'tooltip-checklist';
            
            const criteria = [
                { name: "Awake & Active", ok: target.isActive },
                { name: "Remote Commands", ok: target.supportsRemoteControl },
                { name: "Media Controls", ok: target.supportsMediaControl || (target.isAndroidTv && target.canStartPlayback) }
            ];
            
            criteria.forEach(item => {
                const li = document.createElement('li');
                li.className = item.ok ? 'checklist-item is-ok' : 'checklist-item is-fail';
                li.appendChild(this.textEl('span', item.ok ? '🟢' : '🔴'));
                li.appendChild(this.textEl('strong', item.name));
                tooltipList.appendChild(li);
            });
            tooltip.appendChild(tooltipList);
            
            const tooltipHint = document.createElement('div');
            tooltipHint.className = 'tooltip-hint';
            tooltipHint.textContent = "Click for full troubleshooting guide";
            tooltip.appendChild(tooltipHint);
            
            actionWrapper.appendChild(infoBtn);
            actionWrapper.appendChild(tooltip);
            
            infoBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showTargetDetailsModal(target, backAction);
            });

            label.appendChild(actionWrapper);
            container.appendChild(label);
        });
        
        startButton.disabled = this.selectedPlaybackTargets(container).length === 0;
    }

    showTargetDetailsModal(target, backAction) {
        this.hideModal();
        const overlay = document.createElement('div');
        overlay.id = 'app-modal-overlay';
        overlay.className = 'app-modal-overlay';
        
        const modal = document.createElement('div');
        modal.id = 'app-modal';
        modal.className = 'app-modal glass-card device-details-modal';
        
        const header = document.createElement('div');
        header.className = 'modal-header';
        
        const title = this.textEl('h3', '📺 Playback Device Details');
        const subtitle = this.textEl('p', `${target.userName || 'Jellyfin User'}'s ${target.deviceName || 'Device'}`, 'modal-subtitle');
        header.appendChild(title);
        header.appendChild(subtitle);
        modal.appendChild(header);
        
        const badgeRow = document.createElement('div');
        badgeRow.className = 'device-status-badge-row';
        const verdictBadge = this.textEl('span', target.canStartPlayback ? 'READY TO CONNECT' : 'CONNECTION UNAVAILABLE', target.canStartPlayback ? 'device-badge is-ready' : 'device-badge is-unavailable');
        badgeRow.appendChild(verdictBadge);
        modal.appendChild(badgeRow);

        const detailsGrid = document.createElement('div');
        detailsGrid.className = 'device-details-grid';
        
        const props = [
            { label: "Client App", value: target.client || "Jellyfin Client" },
            { label: "Device Name", value: target.deviceName || "Unknown Target" },
            { label: "Connection Mode", value: target.isAndroidTv ? "Android TV Remote Start" : "Standard Control" },
            { label: "Room Match", value: [target.matchReason, target.matchedParticipantId].filter(Boolean).join(" · ") || "Matched active room user" },
            { label: "Session ID", value: target.sessionId ? target.sessionId.slice(0, 8) + '...' : "N/A" }
        ];
        
        props.forEach(p => {
            const field = document.createElement('div');
            field.className = 'device-prop-field';
            const propLabel = this.textEl('label', p.label);
            const propVal = this.textEl('span', p.value);
            field.appendChild(propLabel);
            field.appendChild(propVal);
            detailsGrid.appendChild(field);
        });
        modal.appendChild(detailsGrid);
        
        modal.appendChild(this.textEl('h4', '📊 Connection Checklist', 'modal-section-title'));
        const checklist = this.createDeviceChecklist(target);
        modal.appendChild(checklist);
        
        modal.appendChild(this.textEl('h4', '🛠️ Action Required / Troubleshooting', 'modal-section-title'));
        
        const troubleshooting = document.createElement('div');
        troubleshooting.className = 'device-troubleshooting-card glass-card';
        
        let steps = [];
        if (!target.isActive) {
            steps = [
                { title: "Launch Player App", text: "Open the Jellyfin app on the target device." },
                { title: "Bring to Foreground", text: "Ensure the Jellyfin player is open, active, and currently in the foreground of the screen." },
                { title: "Avoid Standby", text: "Disable sleep mode or standby timers on your device to keep the connection alive." }
            ];
        } else if (!target.supportsRemoteControl) {
            steps = [
                { title: "Enable Client Controls", text: "Open settings in the client app on your device." },
                { title: "Enable Remote Control Option", text: "Go to Settings, Client Settings, then turn on Enable Remote Control or Allow remote control of this device." },
                { title: "Restart Client", text: "Close and reopen the Jellyfin app to reload capabilities." }
            ];
        } else if (!target.supportsMediaControl && !(target.isAndroidTv && target.canStartPlayback)) {
            steps = [
                { title: "Initialize Player Engine", text: "Start playing any movie or TV show on the target client for a few seconds." },
                { title: "Pause Playback", text: "Once playing, pause it. This binds the media controls on the server." },
                { title: "Use a Supported Player", text: "Ensure you are not running through an external player like VLC or MPV, which blocks control." }
            ];
        } else {
            steps = [
                { title: "Ready to Party!", text: "All connection requirements are fully satisfied." },
                { title: "Check Checkbox", text: "Click 'Cancel' or click outside this modal, select this device, and click 'Start watch party'!" }
            ];
        }
        
        const stepList = document.createElement('ol');
        stepList.className = 'trouble-steps-list';
        steps.forEach(step => {
            const li = document.createElement('li');
            li.appendChild(this.textEl('strong', step.title));
            li.appendChild(document.createTextNode(`: ${step.text}`));
            stepList.appendChild(li);
        });
        troubleshooting.appendChild(stepList);
        modal.appendChild(troubleshooting);
        
        const actionRow = document.createElement('div');
        actionRow.className = 'split-actions';
        if (backAction) {
            actionRow.appendChild(this.button('Back', 'secondary-command', () => {
                this.hideModal();
                backAction();
            }));
        }
        actionRow.appendChild(this.button('Cancel', 'secondary-command', () => this.hideModal()));
        modal.appendChild(actionRow);
        
        overlay.onclick = (event) => { if (event.target === overlay) this.hideModal(); };
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }
    
    createDeviceChecklist(target) {
        const items = [
            {
                name: "Client Awake & Active",
                ok: target.isActive,
                desc: target.isActive ? "App is awake and online." : "App is closed, asleep, or minimized."
            },
            {
                name: "Remote Control Capabilities",
                ok: target.supportsRemoteControl,
                desc: target.supportsRemoteControl ? "Remote control allowed by client settings." : "Remote control settings disabled/blocked in client."
            },
            {
                name: "Media Player Integration",
                ok: target.supportsMediaControl || (target.isAndroidTv && target.canStartPlayback),
                desc: target.supportsMediaControl ? "Media player engine active and ready." : (target.isAndroidTv && target.canStartPlayback ? "Allowed (Android TV Remote-Start Mode)" : "Player engine idle. Play something first.")
            }
        ];
        
        const list = document.createElement('div');
        list.className = 'device-checklist-box';
        
        items.forEach(item => {
            const row = document.createElement('div');
            row.className = item.ok ? 'checklist-row is-ok' : 'checklist-row is-fail';
            
            const icon = document.createElement('span');
            icon.className = 'checklist-row-icon';
            icon.textContent = item.ok ? '🟢' : '🔴';
            
            const content = document.createElement('div');
            content.className = 'checklist-row-copy';
            
            const label = document.createElement('strong');
            label.textContent = item.name;
            
            const desc = document.createElement('p');
            desc.textContent = item.desc;
            
            content.appendChild(label);
            content.appendChild(desc);
            
            row.appendChild(icon);
            row.appendChild(content);
            list.appendChild(row);
        });
        
        return list;
    }

    selectedPlaybackTargets(container) {
        return [...container.querySelectorAll('input[type="checkbox"]:checked')]
            .map(input => input.value)
            .filter(Boolean);
    }

    renderTargetHelpInstructions(container) {
        this.clear(container);
        const card = document.createElement('div');
        card.className = 'target-help-card glass-card';
        
        const title = this.textEl('h4', '📺 How to Connect Your Player');
        card.appendChild(title);
        
        const desc = this.textEl('p', "JellTogether uses Jellyfin's remote-control feature to sync playback. To connect a device, follow these quick steps:");
        card.appendChild(desc);
        
        const list = document.createElement('ul');
        list.className = 'help-list';
        
        const steps = [
            { title: 'Launch Jellyfin', text: 'Open the official Jellyfin app on your TV, desktop player, or a browser tab.' },
            { title: 'Match Your Account', text: 'Verify that the device is logged into the exact same Jellyfin user account.' },
            { title: 'Keep Active', text: 'Ensure the Jellyfin app is open and running in the foreground on your screen.' },
            { title: 'Wake Connection', text: 'If a device is not showing up, wake it up by navigating to the home screen or playing a short video.' },
            { title: 'Android TV', text: 'Enable Android TV targets in the JellTogether dashboard settings.' }
        ];
        
        steps.forEach(step => {
            const li = document.createElement('li');
            li.appendChild(this.textEl('strong', step.title));
            li.appendChild(document.createTextNode(`: ${step.text}`));
            list.appendChild(li);
        });
        
        card.appendChild(list);
        
        const note = this.textEl('div', '🔄 Connection list updates automatically every 5 seconds.', 'help-note');
        card.appendChild(note);
        
        container.appendChild(card);
    }

    async startWatchParty(itemId, targetSessionIds) {
        if (!this.currentRoom || !itemId) return;
        try {
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Queue/${encodeURIComponent(itemId)}/Start`, { targetSessionIds });
            if (!resp.ok) {
                const diagnostics = await this.responsePayload(resp);
                this.showPlaybackDiagnostics(diagnostics, `Playback start failed (${resp.status})`);
                this.showToast('Playback failed. See diagnostics.', 'error');
                return;
            }
            const result = await resp.json();
            this.hideModal();
            await this.refreshRoom();
            if ((result.failedSessionIds || []).length) {
                this.showPlaybackDiagnostics(result, 'Playback partially started');
                this.showToast(`Started ${result.title || 'watch party'} on ${result.startedCount || 0} of ${result.eligibleCount || 0} sessions.`, 'error');
            } else {
                this.showToast(`Started ${result.title || 'watch party'} on ${result.startedCount || 0} session${result.startedCount === 1 ? '' : 's'}.`, 'success');
            }
        } catch (e) {
            console.error("Start Watch Party Error:", e);
            this.showToast("Could not start playback. Make sure participants have active controllable Jellyfin clients.", 'error');
        }
    }

    async responsePayload(resp) {
        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            try {
                return await resp.json();
            } catch (e) {
                console.error('Response JSON parse failed:', e);
            }
        }
        return resp.text();
    }

    showPlaybackDiagnostics(data, title = 'Playback Diagnostics') {
        this.hideModal();

        const overlay = document.createElement('div');
        overlay.id = 'app-modal-overlay';
        overlay.className = 'app-modal-overlay';
        const modal = document.createElement('div');
        modal.id = 'app-modal';
        modal.className = 'app-modal glass-card playback-modal';
        modal.appendChild(this.textEl('h3', title));

        if (typeof data === 'string') {
            modal.appendChild(this.textEl('p', data || 'Jellyfin did not return diagnostic details.', 'modal-subtitle'));
        } else if (data) {
            modal.appendChild(this.textEl('p', `${data.title || 'Selected media'} · ${data.startedCount || 0}/${data.eligibleCount || 0} started`, 'modal-subtitle'));

            const meta = document.createElement('div');
            meta.className = 'diagnostic-meta';
            meta.appendChild(this.textEl('span', `Controller session: ${data.controllingSessionId || 'unknown'}`));
            meta.appendChild(this.textEl('span', `Controller user: ${data.controllingUserId || 'unknown'}`));
            modal.appendChild(meta);

            const attempts = Array.isArray(data.attempts) ? data.attempts : [];
            if (attempts.length) {
                const section = document.createElement('section');
                section.className = 'diagnostic-section';
                section.appendChild(this.textEl('strong', 'Command Attempts'));
                attempts.forEach(attempt => {
                    const row = document.createElement('div');
                    row.className = attempt.success ? 'diagnostic-row is-ok' : 'diagnostic-row is-failed';
                    row.appendChild(this.textEl('span', attempt.success ? 'Sent' : 'Failed', 'target-state'));
                    row.appendChild(this.textEl('strong', `${attempt.deviceName || 'Unknown device'} · ${attempt.client || 'Unknown client'}`));
                    row.appendChild(this.textEl('em', attempt.error || attempt.status || attempt.sessionId || 'No detail returned.'));
                    section.appendChild(row);
                });
                modal.appendChild(section);
            }

            const targets = Array.isArray(data.availableTargets) ? data.availableTargets : [];
            if (targets.length) {
                const section = document.createElement('section');
                section.className = 'diagnostic-section';
                section.appendChild(this.textEl('strong', 'Available Target Snapshot'));
                targets.map(target => this.normalizePlaybackTarget(target)).forEach(target => {
                    const row = document.createElement('div');
                    row.className = target.canStartPlayback ? 'diagnostic-row is-ok' : 'diagnostic-row is-failed';
                    row.appendChild(this.textEl('span', target.canStartPlayback ? 'Ready' : 'Blocked', 'target-state'));
                    row.appendChild(this.textEl('strong', `${target.deviceName || 'Unknown device'} · ${target.client || 'Unknown client'}`));
                    row.appendChild(this.textEl('em', `${target.eligibilityReason || 'No reason'} · ${target.matchReason || 'matched'} · remote=${Boolean(target.supportsRemoteControl)} media=${Boolean(target.supportsMediaControl)} active=${Boolean(target.isActive)}`));
                    section.appendChild(row);
                });
                modal.appendChild(section);
            }
        }

        const actionRow = document.createElement('div');
        actionRow.className = 'split-actions';
        actionRow.appendChild(this.button('View Targets', 'secondary-command', () => this.showPlaybackTargetsModal()));
        actionRow.appendChild(this.button('Close', 'primary-command', () => this.hideModal()));
        modal.appendChild(actionRow);

        overlay.onclick = (event) => { if (event.target === overlay) this.hideModal(); };
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
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

    confirmClearQueue() {
        if (!this.currentRoom || !this.canManage() || !this.currentRoom.queue.length) return;
        this.showModal('Clear queue', [], [
            { label: 'Clear Queue', danger: true, onClick: () => this.clearQueue() }
        ]);
    }

    async clearQueue() {
        if (!this.currentRoom || !this.canManage()) return;
        try {
            const resp = await this.request(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/Queue`, { method: 'DELETE' });
            if (!resp.ok) throw new Error("Queue clear failed");
            this.queuePage = 1;
            await this.refreshRoom();
            this.showToast("Queue cleared.", 'success');
        } catch (e) {
            console.error("Queue Clear Error:", e);
            this.showToast("Failed to clear queue.", 'error');
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
            displayName: this.participantDisplayName(userId),
            mediaUserId: this.participantMediaUserId(userId),
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
        const label = this.participantDisplayName(userId) || userId;
        const parts = String(label || '?').split(/[\s._@-]+/).filter(Boolean);
        const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : String(label || '?').slice(0, 2);
        return letters.toUpperCase();
    }

    participantAvatar(userId, className) {
        const wrapper = this.textEl('span', this.participantInitials(userId), `${className} avatar-fallback`);
        const mediaUserId = this.participantMediaUserId(userId);
        if (!mediaUserId || userId === 'Unknown') return wrapper;

        const image = document.createElement('img');
        image.alt = '';
        image.loading = 'lazy';
        const token = this.getAccessToken();
        const tokenParam = token ? `&api_key=${encodeURIComponent(token)}` : '';
        image.src = this.apiUrl(`/Users/${encodeURIComponent(mediaUserId)}/Images/Primary?fillHeight=160&fillWidth=160&quality=90${tokenParam}`);
        image.onload = () => {
            wrapper.textContent = '';
            wrapper.classList.remove('avatar-fallback');
            wrapper.appendChild(image);
        };
        image.onerror = () => image.remove();
        return wrapper;
    }

    participantProfile(userId) {
        const profiles = this.currentRoom?.participantProfiles || {};
        return profiles[userId] || profiles[String(userId || '').toLowerCase()] || null;
    }

    participantDisplayName(userId) {
        return this.participantProfile(userId)?.displayName || userId || 'Unknown';
    }

    participantMediaUserId(userId) {
        const profile = this.participantProfile(userId);
        if (profile?.mediaUserId) return profile.mediaUserId;
        if (userId === this.currentUser && this.currentJellyfinMediaUserId) return this.currentJellyfinMediaUserId;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(userId || '')) ? userId : '';
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

        const header = document.createElement('div');
        header.className = 'seat-modal-header';
        header.appendChild(this.participantAvatar(occupant.userId, 'seat-modal-avatar'));
        const copy = document.createElement('div');
        copy.className = 'seat-modal-copy';
        copy.appendChild(this.textEl('span', `Seat ${seatIndex + 1}`, 'eyebrow'));
        copy.appendChild(this.textEl('strong', occupant.displayName || occupant.userId, 'seat-modal-name'));
        if (occupant.displayName && occupant.displayName !== occupant.userId) {
            copy.appendChild(this.textEl('em', occupant.userId, 'seat-modal-id'));
        }
        copy.appendChild(this.textEl('span', occupant.role, `role-badge ${occupant.role === 'Host' ? 'role-owner' : occupant.role === 'Co-host' ? 'role-cohost' : ''}`));
        header.appendChild(copy);
        modal.appendChild(header);

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
                this.showToast(`Waved to ${occupant.displayName || occupant.userId}.`, 'success');
            }));
        }
        actionRow.appendChild(this.button('Close', 'secondary-command', () => this.hideModal()));
        modal.appendChild(actionRow);
        overlay.onclick = (event) => { if (event.target === overlay) this.hideModal(); };
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    async checkVR() {
        const button = document.getElementById('btn-vr-mode');
        if (!button) return;

        const isHeadsetBrowser = /OculusBrowser|Quest|Meta Quest|Pico/i.test(navigator.userAgent || '');
        this.xrSupported = false;
        this.xrDomOverlaySupported = false;
        this.xrMode = 'fallback';

        if (window.isSecureContext && navigator.xr?.isSessionSupported) {
            try {
                this.xrSupported = await navigator.xr.isSessionSupported('immersive-vr');
            } catch (e) {
                console.warn('WebXR support check failed:', e);
            }
        }

        if (this.xrSupported || isHeadsetBrowser || document.documentElement.requestFullscreen) {
            button.style.display = 'inline-flex';
            button.textContent = 'Enter Theater';
            button.title = 'Open a headset-friendly fullscreen theater layout.';
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

    async toggleImmersiveMode() {
        if (this.isVR || this.xrSession) {
            await this.exitImmersiveMode();
            return;
        }

        await this.enterImmersiveMode();
    }

    async enterImmersiveMode() {
        try {
            if (window.isSecureContext && navigator.xr?.requestSession && this.xrSupported) {
                const session = await navigator.xr.requestSession('immersive-vr', {
                    requiredFeatures: ['local-floor'],
                    optionalFeatures: ['dom-overlay', 'bounded-floor', 'hand-tracking'],
                    domOverlay: document.body ? { root: document.body } : undefined
                });
                await this.startWebXrSession(session);
                return;
            }
        } catch (e) {
            console.warn('WebXR immersive session failed, falling back to fullscreen theater:', e);
        }

        this.setImmersiveMode(true, 'fallback');
        try {
            if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            }
        } catch (e) {
            console.warn('Fullscreen immersive fallback failed:', e);
        }
    }

    async exitImmersiveMode() {
        if (this.xrSession) {
            try {
                await this.xrSession.end();
            } catch (e) {
                console.warn('WebXR session end failed:', e);
            }
            this.xrSession = null;
        }
        this.stopWebXrSession();

        if (document.fullscreenElement && document.exitFullscreen) {
            try {
                await document.exitFullscreen();
            } catch (e) {
                console.warn('Fullscreen exit failed:', e);
            }
        }

        this.setImmersiveMode(false);
    }

    async startWebXrSession(session) {
        this.xrSession = session;
        this.xrMode = 'webxr';
        this.setImmersiveMode(true, 'webxr');

        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 1024;
        this.xrCanvas = canvas;
        const gl = canvas.getContext('webgl', { xrCompatible: true, alpha: false, antialias: true });
        if (!gl) throw new Error('WebGL is required for WebXR playback.');
        this.xrGl = gl;
        await gl.makeXRCompatible?.();

        this.xrLayer = new XRWebGLLayer(session, gl);
        session.updateRenderState({ baseLayer: this.xrLayer });
        this.xrRefSpace = await session.requestReferenceSpace('local-floor');
        session.addEventListener('end', () => {
            this.stopWebXrSession();
            if (this.isVR) this.setImmersiveMode(false);
        });

        this.initXrScene(gl);
        this.xrFrameHandle = session.requestAnimationFrame((time, frame) => this.renderXrFrame(time, frame));
    }

    stopWebXrSession() {
        if (this.xrFrameHandle && this.xrSession?.cancelAnimationFrame) {
            try { this.xrSession.cancelAnimationFrame(this.xrFrameHandle); } catch (e) { /* ignore */ }
        }
        this.xrFrameHandle = 0;
        this.xrRefSpace = null;
        this.xrLayer = null;
        this.xrTexture = null;
        this.xrGeometryBuffer = null;
        this.xrProgram = null;
        this.xrGl = null;
        this.xrCanvas = null;
    }

    initXrScene(gl) {
        const vertexSrc = `
            attribute vec3 a_position;
            attribute vec2 a_uv;
            uniform mat4 u_matrix;
            varying vec2 v_uv;
            void main() {
                v_uv = a_uv;
                gl_Position = u_matrix * vec4(a_position, 1.0);
            }
        `;
        const fragmentSrc = `
            precision mediump float;
            varying vec2 v_uv;
            uniform sampler2D u_texture;
            uniform float u_hasVideo;
            void main() {
                vec4 tex = texture2D(u_texture, v_uv);
                vec3 backdrop = vec3(0.02, 0.03, 0.06);
                vec3 color = mix(backdrop, tex.rgb, u_hasVideo);
                gl_FragColor = vec4(color, 1.0);
            }
        `;
        const vertexShader = this.compileShader(gl, gl.VERTEX_SHADER, vertexSrc);
        const fragmentShader = this.compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(program) || 'Failed to link XR program.');
        }
        this.xrProgram = program;

        const vertices = new Float32Array([
            -1, -0.5625, 0, 0, 1,
             1, -0.5625, 0, 1, 1,
            -1,  0.5625, 0, 0, 0,
             1,  0.5625, 0, 1, 0
        ]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        this.xrGeometryBuffer = buffer;

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([5, 7, 12, 255]));
        this.xrTexture = texture;
    }

    compileShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed.');
        }
        return shader;
    }

    renderXrFrame(time, frame) {
        if (!this.xrSession || !this.xrGl || !this.xrLayer || !this.xrProgram || !this.xrRefSpace) return;
        const gl = this.xrGl;
        const session = this.xrSession;
        const pose = frame.getViewerPose(this.xrRefSpace);
        session.requestAnimationFrame((nextTime, nextFrame) => this.renderXrFrame(nextTime, nextFrame));

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.xrLayer.framebuffer);
        gl.enable(gl.DEPTH_TEST);
        gl.clearColor(0.02, 0.03, 0.06, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        if (!pose) return;

        const video = document.getElementById('theater-video');
        const hasVideo = Boolean(video && !video.hidden && video.readyState >= 2);
        if (hasVideo && this.xrTexture && video.videoWidth > 0 && video.videoHeight > 0) {
            gl.bindTexture(gl.TEXTURE_2D, this.xrTexture);
            try {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
            } catch (e) {
                console.warn('XR video texture update failed:', e);
            }
        }

        gl.useProgram(this.xrProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.xrGeometryBuffer);
        const positionLocation = gl.getAttribLocation(this.xrProgram, 'a_position');
        const uvLocation = gl.getAttribLocation(this.xrProgram, 'a_uv');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(uvLocation);
        gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 20, 12);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.xrTexture);
        gl.uniform1i(gl.getUniformLocation(this.xrProgram, 'u_texture'), 0);
        gl.uniform1f(gl.getUniformLocation(this.xrProgram, 'u_hasVideo'), hasVideo ? 1 : 0);

        for (const view of pose.views) {
            const viewport = this.xrLayer.getViewport(view);
            gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);

            const viewMatrix = this.inverseMatrix4(view.transform.matrix);
            const modelMatrix = this.multiplyMatrix4(this.translateMatrix4(0, -0.15, -2.6), this.scaleMatrix4(this.videoAspectScale()));
            const mvp = this.multiplyMatrix4(view.projectionMatrix, this.multiplyMatrix4(viewMatrix, modelMatrix));
            gl.uniformMatrix4fv(gl.getUniformLocation(this.xrProgram, 'u_matrix'), false, mvp);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
    }

    videoAspectScale() {
        const video = document.getElementById('theater-video');
        const aspect = video?.videoWidth && video?.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
        return [1.8 * Math.min(1, aspect), 1.0, 1];
    }

    translateMatrix4(x, y, z) {
        return new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            x, y, z, 1
        ]);
    }

    scaleMatrix4(scale) {
        const [x, y, z] = scale;
        return new Float32Array([
            x, 0, 0, 0,
            0, y, 0, 0,
            0, 0, z, 0,
            0, 0, 0, 1
        ]);
    }

    multiplyMatrix4(a, b) {
        const out = new Float32Array(16);
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                let sum = 0;
                for (let i = 0; i < 4; i++) {
                    sum += a[row * 4 + i] * b[i * 4 + col];
                }
                out[row * 4 + col] = sum;
            }
        }
        return out;
    }

    inverseMatrix4(m) {
        const inv = new Float32Array(16);
        const a = m;
        inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
        inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
        inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
        inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
        inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
        inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
        inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
        inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
        inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
        inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
        inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
        inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
        inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
        inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
        inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
        inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
        let det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
        if (!det) return new Float32Array(16);
        det = 1 / det;
        for (let i = 0; i < 16; i++) inv[i] *= det;
        return inv;
    }

    setImmersiveMode(enabled, mode = this.xrMode) {
        this.isVR = enabled;
        document.body.classList.toggle('theme-vr', enabled);
        document.body.classList.toggle('theme-webxr', enabled && mode === 'webxr');
        document.body.classList.toggle('theme-xr-fallback', enabled && mode !== 'webxr');
        const btn = document.getElementById('btn-vr-mode');
        if (btn) {
            btn.textContent = enabled ? 'Exit Theater' : 'Enter Theater';
            btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        }
    }

    async syncDiscordStage(titleOverride = null) {
        if (!this.discordStageId) {
            this.showToast('Set a Discord Stage channel in global settings first.', 'error');
            return;
        }

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
            const resp = await this.jsonPost(`/jelltogether/Rooms/${encodeURIComponent(this.currentRoom.id)}/SyncStage`, { title: title.trim() });
            if (!resp.ok) {
                const detail = await resp.text().catch(() => "");
                throw new Error(detail || `Discord sync failed with ${resp.status}`);
            }
            this.showToast("Discord Stage synced.", 'success');
        } catch (e) {
            console.error("Discord Sync Error:", e);
            this.showToast(e?.message || "Failed to sync Discord Stage. Check the global Discord settings.", 'error');
        }
    }

    updateDiscordStageActionState() {
        const button = document.getElementById('btn-sync-discord-stage');
        if (button) button.disabled = !this.discordStageId;
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
            if (msg.source === 'discord') {
                bubble.appendChild(this.textEl('span', 'Discord Stage', 'message-source'));
            }
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
            ['sidebar-tabs', 'participant-section', 'room-management', 'host-theme-controls', 'poll-section', 'reaction-bar', 'chat-container'].forEach(id => {
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
