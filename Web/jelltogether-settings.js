class JellTogetherSettingsApp {
    constructor() {
        this.settings = null;
        this.libraries = [];
        this.init();
    }

    async init() {
        this.bind();
        await this.load();
        await this.loadLibraries();
    }

    bind() {
        const publicUrl = document.getElementById('settings-public-jellyfin-url');
        if (publicUrl) {
            publicUrl.addEventListener('input', () => this.updateCompanionPill());
        }
    }

    async request(url, options = {}) {
        const headers = new Headers(options.headers || {});
        const token = this.getAccessToken();
        if (token && !headers.has('X-Emby-Token')) headers.set('X-Emby-Token', token);
        return fetch(url, { ...options, headers, credentials: 'same-origin' });
    }

    async fetchJson(url, options = {}) {
        const resp = await this.request(url, options);
        if (!resp.ok) throw new Error(`${options.method || 'GET'} ${url} failed with ${resp.status}`);
        return resp.json();
    }

    getAccessToken() {
        const apiClient = window.ApiClient;
        const candidates = [
            typeof apiClient?.accessToken === 'function' ? apiClient.accessToken() : apiClient?.accessToken,
            typeof apiClient?.getAccessToken === 'function' ? apiClient.getAccessToken() : null,
            apiClient?._serverInfo?.AccessToken,
            apiClient?.serverInfo?.AccessToken
        ];

        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
        }

        return '';
    }

    async load() {
        try {
            this.settings = await this.fetchJson('/jelltogether/GlobalSettings');
            document.getElementById('settings-public-jellyfin-url').value = this.settings.publicJellyfinUrl || '';
            document.getElementById('settings-queue-voting').checked = this.settings.allowQueueVotingByDefault !== false;
            document.getElementById('settings-participant-queue').checked = this.settings.allowParticipantQueueAdds !== false;
            document.getElementById('settings-participant-invites').checked = this.settings.allowParticipantInvitesByDefault !== false;
            document.getElementById('settings-persist-history').checked = this.settings.persistRoomHistory !== false;
            document.getElementById('settings-invite-hours').value = this.settings.defaultInviteExpirationHours ?? 24;
            this.updateCompanionPill();
        } catch (e) {
            console.error('JellTogether settings load failed:', e);
            this.toast('Could not load JellTogether settings.', 'error');
        }
    }

    async loadLibraries() {
        const container = document.getElementById('settings-library-list');
        if (!container) return;
        container.replaceChildren(this.textEl('div', 'Loading libraries...', 'loading'));

        try {
            const userId = this.currentUserId();
            if (!userId) throw new Error('Missing current user id.');
            const result = await this.fetchJson(`/Users/${encodeURIComponent(userId)}/Views`);
            this.libraries = result.Items || result.items || [];
            this.renderLibraries();
        } catch (e) {
            console.error('Library load failed:', e);
            container.replaceChildren(this.textEl('div', 'Libraries could not be loaded.', 'loading'));
        }
    }

    currentUserId() {
        const apiClient = window.ApiClient;
        return apiClient?._serverInfo?.UserId || apiClient?.serverInfo?.UserId || apiClient?._currentUser?.Id || apiClient?._currentUser?.id || '';
    }

    renderLibraries() {
        const container = document.getElementById('settings-library-list');
        container.replaceChildren();
        if (!this.libraries.length) {
            container.appendChild(this.textEl('div', 'No libraries found.', 'loading'));
            return;
        }

        const selected = new Set(this.settings?.enabledLibraryIds || []);
        this.libraries.forEach(library => {
            const id = library.Id || library.id;
            const name = library.Name || library.name || 'Untitled library';
            const type = library.CollectionType || library.collectionType || library.Type || library.type || 'library';

            const label = document.createElement('label');
            label.className = 'library-option';
            label.innerHTML = `<span><strong></strong><em></em></span>`;
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = id;
            checkbox.checked = selected.size === 0 || selected.has(id);
            label.prepend(checkbox);
            label.querySelector('strong').textContent = name;
            label.querySelector('em').textContent = type;
            container.appendChild(label);
        });
    }

    generatedCompanionUrl() {
        const base = document.getElementById('settings-public-jellyfin-url')?.value?.trim().replace(/\/+$/, '') || '';
        return base ? `${base}/jelltogether/Companion` : '';
    }

    updateCompanionPill() {
        const pill = document.getElementById('settings-companion-pill');
        if (pill) pill.textContent = this.generatedCompanionUrl() || 'Set a public Jellyfin URL';
    }

    async copyCompanionUrl() {
        const value = this.generatedCompanionUrl();
        if (!value) {
            this.toast('Nothing to copy yet.', 'error');
            return;
        }
        await navigator.clipboard.writeText(value);
        this.toast('Companion URL copied.', 'success');
    }

    async save() {
        const enabledLibraryIds = [...document.querySelectorAll('#settings-library-list input[type="checkbox"]:checked')]
            .map(input => input.value)
            .filter(Boolean);
        const publicJellyfinUrl = document.getElementById('settings-public-jellyfin-url')?.value?.trim() || '';
        const payload = {
            publicJellyfinUrl,
            publicCompanionUrl: this.generatedCompanionUrl(),
            enabledLibraryIds,
            allowQueueVotingByDefault: document.getElementById('settings-queue-voting')?.checked === true,
            allowParticipantQueueAdds: document.getElementById('settings-participant-queue')?.checked === true,
            allowParticipantInvitesByDefault: document.getElementById('settings-participant-invites')?.checked === true,
            persistRoomHistory: document.getElementById('settings-persist-history')?.checked === true,
            defaultInviteExpirationHours: parseInt(document.getElementById('settings-invite-hours')?.value || '24', 10)
        };

        try {
            const resp = await this.request('/jelltogether/GlobalSettings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!resp.ok) throw new Error(`Save failed with ${resp.status}`);
            this.settings = { ...this.settings, ...payload };
            this.toast('JellTogether settings saved.', 'success');
        } catch (e) {
            console.error('JellTogether settings save failed:', e);
            this.toast('Could not save settings.', 'error');
        }
    }

    textEl(tag, text, className = null) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        el.textContent = text;
        return el;
    }

    toast(message, tone = 'info') {
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
        dismiss.onclick = () => toast.remove();
        toast.appendChild(dismiss);
        stack.appendChild(toast);
        setTimeout(() => toast.remove(), 5200);
    }
}

window.settingsApp = new JellTogetherSettingsApp();
