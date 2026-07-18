import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'MindBase Capture',
    description: 'Capture pages, selections, and screenshots into your MindBase wiki',
    permissions: ['activeTab', 'storage', 'contextMenus', 'scripting', 'alarms'],
    host_permissions: ['<all_urls>'],
    commands: {
      'open-popup': {
        suggested_key: { default: 'Ctrl+Shift+M', mac: 'Command+Shift+M' },
        description: 'Open MindBase capture',
      },
    },
    action: { default_title: 'MindBase Capture' },
    options_page: 'options.html',
  },
});
