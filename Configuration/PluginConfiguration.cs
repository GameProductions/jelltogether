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
    }
}
