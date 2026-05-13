using MediaBrowser.Model.Plugins;

namespace JellTogether.Plugin.Configuration
{
    public class PluginConfiguration : BasePluginConfiguration
    {
        public bool EnableChat { get; set; } = true;
        public bool PersistChatHistory { get; set; } = false;
        public int MaxChatHistory { get; set; } = 100;
        public string WelcomeMessage { get; set; } = "Welcome to the JellTogether Watch Party!";
        public string PublicJellyfinUrl { get; set; } = string.Empty;
        public string PublicCompanionUrl { get; set; } = string.Empty;
        public List<string> EnabledLibraryIds { get; set; } = new();
        public bool AllowQueueVotingByDefault { get; set; } = true;
        public bool AllowParticipantQueueAdds { get; set; } = true;
        public bool AllowParticipantInvitesByDefault { get; set; } = true;
        public bool PersistRoomHistory { get; set; } = true;
        public int DefaultInviteExpirationHours { get; set; } = 24;
    }
}
