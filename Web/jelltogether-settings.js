class JellTogetherSettingsApp {
    constructor() {
        this.settings = null;
        this.libraries = [];
        this.discordStageChannels = [];
        this.discordStagePickerMode = 'manual';
        this.discordStageId = '';
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

        document.getElementById('settings-discord-clear-token')?.addEventListener('change', () => {
            this.updateDiscordTokenStatus();
            this.renderDiscordStageControl();
        });
    }

    async request(url, options = {}) {
        const headers = new Headers(options.headers || {});
        const token = this.getAccessToken();
        if (token && !headers.has('X-Emby-Token')) headers.set('X-Emby-Token', token);
        const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
        if (response.status === 401) this.toast('Sign in to Jellyfin as an administrator to manage JellTogether settings.', 'error');
        return response;
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
            document.getElementById('settings-android-tv-targets').checked = this.settings.allowAndroidTvPlaybackTargets !== false;
            document.getElementById('settings-persist-history').checked = this.settings.persistRoomHistory !== false;
            document.getElementById('settings-invite-hours').value = this.settings.defaultInviteExpirationHours ?? 24;
            document.getElementById('settings-discord-stage-id').value = this.settings.discordStageId || '';
            this.discordStageId = this.settings.discordStageId || '';
            document.getElementById('settings-discord-chat-sync').checked = this.settings.enableDiscordStageChatSync !== false;
            document.getElementById('settings-discord-bot-token').value = '';
            document.getElementById('settings-discord-clear-token').checked = false;
            this.updateDiscordTokenStatus();
            this.updateDiscordTokenControls();
            await this.loadDiscordStageChannels();
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
            this.libraries = await this.fetchServerLibraries();
            this.renderLibraries();
        } catch (e) {
            console.error('Library load failed:', e);
            container.replaceChildren(this.textEl('div', 'Libraries could not be loaded.', 'loading'));
        }
    }

    async fetchServerLibraries() {
        try {
            const result = await this.fetchJson('/Library/MediaFolders?IsHidden=false');
            const items = result.Items || result.items || [];
            if (items.length) return this.normalizeLibraries(items, 'server library');
        } catch (e) {
            console.warn('Media folder lookup failed, falling back to user views:', e);
        }

        const userId = await this.currentUserId();
        if (!userId) throw new Error('Missing current user id.');
        const result = await this.fetchJson(`/Users/${encodeURIComponent(userId)}/Views`);
        return this.normalizeLibraries(result.Items || result.items || [], 'user view');
    }

    normalizeLibraries(items, fallbackType) {
        return items
            .map(item => ({
                id: item.Id || item.id || '',
                name: item.Name || item.name || 'Untitled library',
                type: item.CollectionType || item.collectionType || item.Type || item.type || fallbackType,
                imageUrl: this.libraryImageUrl(item)
            }))
            .filter(item => item.id)
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    libraryImageUrl(item) {
        const id = item.Id || item.id || '';
        if (!id) return '';
        return `/Items/${encodeURIComponent(id)}/Images/Primary?fillHeight=96&fillWidth=96&quality=90`;
    }

    async currentUserId() {
        const apiClient = window.ApiClient;
        const apiUserId = apiClient?._serverInfo?.UserId || apiClient?.serverInfo?.UserId || apiClient?._currentUser?.Id || apiClient?._currentUser?.id || '';
        if (apiUserId) return apiUserId;

        try {
            const user = await this.fetchJson('/jelltogether/CurrentUser');
            return user.mediaUserId || user.mediaUserID || user.id || user.name || '';
        } catch (e) {
            console.warn('Current user lookup failed:', e);
            return '';
        }
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
            const label = document.createElement('label');
            label.className = 'library-option';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = library.id;
            checkbox.checked = selected.size === 0 || selected.has(library.id);
            label.appendChild(checkbox);

            const thumb = document.createElement('span');
            thumb.className = 'library-thumb';
            thumb.setAttribute('aria-hidden', 'true');
            if (library.imageUrl) {
                const image = document.createElement('img');
                image.alt = '';
                image.loading = 'lazy';
                image.src = library.imageUrl;
                image.onload = () => thumb.classList.add('has-image');
                image.onerror = () => image.remove();
                thumb.appendChild(image);
            }

            const copy = document.createElement('span');
            copy.className = 'library-copy';
            copy.appendChild(this.textEl('strong', library.name));
            copy.appendChild(this.textEl('em', library.type));
            label.appendChild(thumb);
            label.appendChild(copy);
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
        try {
            await navigator.clipboard.writeText(value);
            this.toast('Companion URL copied.', 'success');
        } catch (e) {
            console.error('Companion URL copy failed:', e);
            this.toast('Copy failed. Select the companion URL and copy it manually.', 'error');
        }
    }

    async save() {
        const enabledLibraryIds = [...document.querySelectorAll('#settings-library-list input[type="checkbox"]:checked')]
            .map(input => input.value)
            .filter(Boolean);
        const publicJellyfinUrl = document.getElementById('settings-public-jellyfin-url')?.value?.trim() || '';
        const discordStageId = this.selectedDiscordStageId() || this.settings?.discordStageId || '';
        const payload = {
            publicJellyfinUrl,
            publicCompanionUrl: this.generatedCompanionUrl(),
            enabledLibraryIds,
            allowQueueVotingByDefault: document.getElementById('settings-queue-voting')?.checked === true,
            allowParticipantQueueAdds: document.getElementById('settings-participant-queue')?.checked === true,
            allowParticipantInvitesByDefault: document.getElementById('settings-participant-invites')?.checked === true,
            allowAndroidTvPlaybackTargets: document.getElementById('settings-android-tv-targets')?.checked === true,
            persistRoomHistory: document.getElementById('settings-persist-history')?.checked === true,
            defaultInviteExpirationHours: parseInt(document.getElementById('settings-invite-hours')?.value || '24', 10),
            discordStageId,
            enableDiscordStageChatSync: document.getElementById('settings-discord-chat-sync')?.checked !== false,
            discordBotToken: this.isDiscordEnvironmentTokenActive() ? '' : (document.getElementById('settings-discord-bot-token')?.value?.trim() || ''),
            clearDiscordBotToken: this.isDiscordEnvironmentTokenActive() ? false : document.getElementById('settings-discord-clear-token')?.checked === true
        };

        try {
            const resp = await this.request('/jelltogether/GlobalSettings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!resp.ok) throw new Error(`Save failed with ${resp.status}`);
            this.settings = {
                ...this.settings,
                ...payload,
                hasDiscordBotToken: this.isDiscordEnvironmentTokenActive() || (payload.clearDiscordBotToken ? false : Boolean(payload.discordBotToken || this.settings?.hasDiscordBotToken))
            };
            this.discordStageId = discordStageId;
            document.getElementById('settings-discord-bot-token').value = '';
            document.getElementById('settings-discord-clear-token').checked = false;
            this.updateDiscordTokenStatus();
            this.updateDiscordTokenControls();
            await this.loadDiscordStageChannels();
            await this.load();
            this.toast('JellTogether settings saved.', 'success');
        } catch (e) {
            console.error('JellTogether settings save failed:', e);
            this.toast('Could not save settings.', 'error');
        }
    }

    updateDiscordTokenStatus() {
        const status = document.getElementById('settings-discord-token-status');
        if (!status) return;
        status.textContent = this.isDiscordEnvironmentTokenActive()
            ? 'Discord bot token is provided by the Jellyfin server environment variable JELLTOGETHER_DISCORD_BOT_TOKEN. UI token editing is disabled.'
            : this.settings?.hasDiscordBotToken
            ? 'A Discord bot token is saved. Enter a new token to replace it, or choose clear saved bot token.'
            : 'No bot token saved.';
    }

    updateDiscordTokenControls() {
        const environmentToken = this.isDiscordEnvironmentTokenActive();
        const token = document.getElementById('settings-discord-bot-token');
        const clear = document.getElementById('settings-discord-clear-token');
        if (token) {
            token.disabled = environmentToken;
            token.placeholder = environmentToken
                ? 'Provided by JELLTOGETHER_DISCORD_BOT_TOKEN'
                : 'Leave blank to keep the saved token';
        }
        if (clear) clear.disabled = environmentToken;
    }

    isDiscordEnvironmentTokenActive() {
        return this.settings?.discordBotTokenSource === 'environment';
    }

    async loadDiscordStageChannels() {
        if (!this.settings?.hasDiscordBotToken || document.getElementById('settings-discord-clear-token')?.checked === true) {
            this.discordStageChannels = [];
            this.renderDiscordStageControl();
            return;
        }

        const container = document.getElementById('settings-discord-stage-control');
        if (container) container.replaceChildren(this.textEl('div', 'Loading eligible Discord Stage channels...', 'loading'));

        try {
            const result = await this.fetchJson('/jelltogether/Discord/StageChannels');
            const channels = this.discordProp(result, 'channels', []);
            this.discordStageChannels = Array.isArray(channels)
                ? channels.map(channel => this.normalizeDiscordStageChannel(channel)).filter(channel => channel.id)
                : [];
            this.renderDiscordStageControl();
        } catch (e) {
            console.error('Discord Stage channel load failed:', e);
            this.discordStageChannels = [];
            this.renderDiscordStageControl('Saved Discord bot token could not load Stage channels. Check the token and bot permissions.');
        }
    }

    renderDiscordStageControl(errorMessage = '') {
        const container = document.getElementById('settings-discord-stage-control');
        const hidden = document.getElementById('settings-discord-stage-id');
        if (!container || !hidden) return;

        container.replaceChildren();
        const shouldUseManual = !this.settings?.hasDiscordBotToken || document.getElementById('settings-discord-clear-token')?.checked === true;
        if (shouldUseManual) {
            this.discordStagePickerMode = 'manual';
            const input = document.createElement('input');
            input.type = 'text';
            input.id = 'settings-discord-stage-picker';
            input.className = 'glass-input';
            input.placeholder = 'Discord stage channel ID';
            input.value = hidden.value || this.settings?.discordStageId || '';
            input.addEventListener('input', () => {
                hidden.value = input.value.trim();
                this.discordStageId = hidden.value;
                this.updateDiscordStageActionState();
            });
            container.appendChild(input);
            container.appendChild(this.textEl('div', 'Save a bot token to search eligible Stage channels automatically.', 'settings-note'));
            this.updateDiscordStageActionState();
            return;
        }

        this.discordStagePickerMode = 'search';
        if (this.settings?.discordStageId) hidden.value = this.settings.discordStageId;

        const selected = this.discordStageChannels.find(channel => channel.id === hidden.value) || null;
        const search = document.createElement('input');
        search.type = 'search';
        search.id = 'settings-discord-stage-picker';
        search.className = 'glass-input';
        search.placeholder = this.discordStageChannels.length ? 'Search Discord Stage channels' : 'No eligible Stage channels found';
        search.value = selected ? this.stageChannelLabel(selected) : '';

        const actions = document.createElement('div');
        actions.className = 'stage-channel-actions';
        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.className = 'secondary-command compact';
        refresh.textContent = 'Refresh';
        refresh.onclick = () => this.loadDiscordStageChannels();
        actions.appendChild(refresh);

        const results = document.createElement('div');
        results.className = 'stage-channel-results';
        const selectedPill = document.createElement('button');
        selectedPill.type = 'button';
        selectedPill.className = 'copy-pill stage-channel-pill';
        selectedPill.textContent = selected ? `Selected: ${this.stageChannelLabel(selected)}` : 'No Stage channel selected';
        selectedPill.title = 'The saved Discord Stage channel ID is stored here.';
        selectedPill.onclick = () => {
            if (selected) this.toast(`Selected ${this.stageChannelLabel(selected)}`, 'info');
        };

        const renderResults = () => {
            const query = search.value.trim().toLowerCase();
            const matches = this.discordStageChannels
                .filter(channel => this.stageChannelLabel(channel).toLowerCase().includes(query) || channel.id.includes(query))
                .slice(0, 12);

            results.replaceChildren();
            if (!matches.length) {
                results.appendChild(this.textEl('div', this.discordStageChannels.length ? 'No matching Stage channels.' : 'No eligible Stage channels found for this bot.', 'settings-note'));
                return;
            }

            matches.forEach(channel => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `stage-channel-option${channel.id === hidden.value ? ' is-selected' : ''}`;
                button.appendChild(this.textEl('strong', channel.name || 'Stage channel'));
                button.appendChild(this.textEl('em', `${channel.guildName || 'Discord server'} · ${channel.id}`));
                button.onclick = () => {
                    hidden.value = channel.id;
                    search.value = this.stageChannelLabel(channel);
                    this.discordStageId = channel.id;
                    selectedPill.textContent = `Selected: ${this.stageChannelLabel(channel)}`;
                    renderResults();
                    this.updateDiscordStageActionState();
                };
                results.appendChild(button);
            });
        };

        search.addEventListener('input', renderResults);
        search.addEventListener('focus', renderResults);
        container.appendChild(search);
        container.appendChild(actions);
        container.appendChild(selectedPill);
        if (errorMessage) container.appendChild(this.textEl('div', errorMessage, 'settings-note'));
        container.appendChild(results);
        container.appendChild(this.manualStageIdDetails(hidden));
        renderResults();
        this.updateDiscordStageActionState();
    }

    manualStageIdDetails(hidden) {
        const details = document.createElement('details');
        details.className = 'settings-disclosure compact-disclosure';
        const summary = document.createElement('summary');
        summary.textContent = 'Enter Stage Channel ID Manually';
        details.appendChild(summary);

        const body = document.createElement('div');
        body.className = 'manual-stage-entry';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'glass-input';
        input.placeholder = 'Discord stage channel ID';
        input.value = hidden.value || this.settings?.discordStageId || '';
        input.addEventListener('input', () => hidden.value = input.value.trim());
        body.appendChild(input);
        body.appendChild(this.textEl('div', 'Use this when Discord channel discovery cannot list a channel the bot can still manage.', 'settings-note'));
        details.appendChild(body);
        return details;
    }

    selectedDiscordStageId() {
        const hidden = document.getElementById('settings-discord-stage-id');
        const picker = document.getElementById('settings-discord-stage-picker');
        if (this.discordStagePickerMode === 'manual') return picker?.value?.trim() || '';
        return hidden?.value?.trim() || '';
    }

    updateDiscordStageActionState() {
        const stageId = (this.settings?.discordStageId || this.discordStageId || '').trim();
        const testButton = document.getElementById('settings-test-discord-stage');
        if (testButton) testButton.disabled = !stageId;
    }

    async testDiscordStage() {
        const payload = {
            discordStageId: this.selectedDiscordStageId(),
            discordBotToken: document.getElementById('settings-discord-bot-token')?.value?.trim() || ''
        };

        try {
            const resp = await this.request('/jelltogether/Discord/TestStage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await this.responsePayload(resp);
            if (!resp.ok) throw result;
            const normalized = this.normalizeDiscordTestResult(result);
            this.toast(normalized.status || 'Discord Stage connection is ready.', normalized.success === false ? 'info' : 'success');
            this.showDiscordTestResult(normalized, 'Discord Connection Ready');
        } catch (e) {
            console.error('Discord Stage test failed:', e);
            const normalized = this.normalizeDiscordTestResult(e);
            this.toast(normalized.status || 'Discord Stage connection test failed.', 'error');
            this.showDiscordTestResult(normalized, 'Discord Connection Failed');
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

    showDiscordTestResult(result, title) {
        let panel = document.getElementById('settings-discord-test-result');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'settings-discord-test-result';
            panel.className = 'discord-test-result settings-note';
            document.getElementById('settings-discord-token-status')?.after(panel);
        }

        const checks = Array.isArray(result?.checks) ? result.checks : [];
        panel.replaceChildren();
        panel.appendChild(this.textEl('strong', title));
        panel.appendChild(this.textEl('span', result?.status || 'No detailed status was returned.'));
        if (result?.channelName) panel.appendChild(this.textEl('span', `Channel: ${result.channelName}`));
        if (result?.channelId) panel.appendChild(this.textEl('span', `Channel ID: ${result.channelId}`));
        if (result?.guildName) panel.appendChild(this.textEl('span', `Server: ${result.guildName}`));
        if (result?.guildId) panel.appendChild(this.textEl('span', `Server ID: ${result.guildId}`));
        checks.forEach(check => panel.appendChild(this.textEl('span', `Passed: ${check}`)));
    }

    stageChannelLabel(channel) {
        return channel?.label || `${channel?.guildName || 'Discord server'} / ${channel?.name || 'Stage channel'}`;
    }

    normalizeDiscordStageChannel(channel) {
        const normalized = {
            id: String(this.discordProp(channel, 'id', '') || ''),
            name: this.discordProp(channel, 'name', 'Stage channel') || 'Stage channel',
            guildId: String(this.discordProp(channel, 'guildId', '') || ''),
            guildName: this.discordProp(channel, 'guildName', 'Discord server') || 'Discord server'
        };
        normalized.label = this.discordProp(channel, 'label', `${normalized.guildName} / ${normalized.name}`);
        return normalized;
    }

    normalizeDiscordTestResult(result) {
        if (!result || typeof result !== 'object') {
            return { success: false, status: String(result || 'No detailed status was returned.'), checks: [] };
        }

        return {
            success: this.discordProp(result, 'success', false) === true,
            status: this.discordProp(result, 'status', ''),
            channelId: this.discordProp(result, 'channelId', ''),
            channelName: this.discordProp(result, 'channelName', ''),
            guildId: this.discordProp(result, 'guildId', ''),
            guildName: this.discordProp(result, 'guildName', ''),
            checks: this.discordProp(result, 'checks', [])
        };
    }

    discordProp(source, camelName, fallback = '') {
        if (!source || typeof source !== 'object') return fallback;
        if (source[camelName] !== undefined) return source[camelName];
        const pascalName = `${camelName.charAt(0).toUpperCase()}${camelName.slice(1)}`;
        return source[pascalName] !== undefined ? source[pascalName] : fallback;
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
