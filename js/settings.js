/**
 * RK FASHIONS — Settings & Demo Data Service
 * Store profiles, printing presets, Firebase key inputs, and sample retail inventory.
 */

class SettingsService {
  constructor() {}

  async get(key, defaultValue = null) {
    try {
      const record = await window.appDB.get('settings', key);
      return record ? record.value : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  async set(key, value) {
    await window.appDB.update('settings', { key, value });
  }

  async getAllSettings() {
    const list = await window.appDB.getAll('settings');
    const map = {};
    list.forEach(item => { map[item.key] = item.value; });
    return map;
  }

  async saveAllSettings(formData) {
    for (const [key, value] of Object.entries(formData)) {
      await this.set(key, value);
    }
  }

  }
}

window.settingsService = new SettingsService();
