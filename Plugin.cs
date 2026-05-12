using System;
using System.Collections.Generic;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using JellTogether.Plugin.Configuration;

namespace JellTogether.Plugin
{
    public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
    {
        public override string Name => "JellTogether";
        public override Guid Id => Guid.Parse("f9e1e2d3-a4b5-4c6d-8e9f-0a1b2c3d4e5f");
        public override string Description => "Premium Watch Party and Chat for Jellyfin.";

        public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
            : base(applicationPaths, xmlSerializer)
        {
            Instance = this;
            RoomManager = new Services.RoomManager(applicationPaths.ConfigurationDirectoryPath);
        }

        public static Plugin? Instance { get; private set; }
        public Services.RoomManager? RoomManager { get; private set; }

        public IEnumerable<PluginPageInfo> GetPages()
        {
            return new[]
            {
                new PluginPageInfo
                {
                    Name = "jelltogether",
                    DisplayName = "JellTogether",
                    EmbeddedResourcePath = GetType().Namespace + ".Web.jelltogether.html",
                    EnableInMainMenu = true,
                    MenuSection = "server",
                    MenuIcon = "movie"
                },
                new PluginPageInfo
                {
                    Name = "jelltogether.css",
                    EmbeddedResourcePath = GetType().Namespace + ".Web.jelltogether.css"
                },
                new PluginPageInfo
                {
                    Name = "jelltogether.js",
                    EmbeddedResourcePath = GetType().Namespace + ".Web.jelltogether.js"
                },
                new PluginPageInfo
                {
                    Name = "strings.js",
                    EmbeddedResourcePath = GetType().Namespace + ".Web.strings.js"
                },
                new PluginPageInfo
                {
                    Name = "logo.png",
                    EmbeddedResourcePath = GetType().Namespace + ".Web.logo.png"
                }
            };
        }
    }
}
