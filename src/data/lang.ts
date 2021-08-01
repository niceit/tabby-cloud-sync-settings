class CloudSyncLangClass {
    lang = {
        form: {
            error: {
                required_all: 'Please fill in all fields',
            },
        },
        settings: {
            title: 'Cloud Sync Setting',
            sub_title: 'Here you could login to your cloud account and sync the settings across devices.',
            service_label: 'Services',
            amazon: {
                connected: 'S3 Service Connected!',
                save_settings_failed: 'An error occurred when trying to save config.',
                save_settings_success: 'Your settings is saved.',
            },
        },
        buttons: {
            check_update: 'Check for updates',
        },
    }

    trans = (key: string): string => {
        let dict = this.lang
        const objects = key.split('.')
        for (const i in objects) {
            if (typeof dict[objects[i]] !== 'undefined') {
                dict = dict[objects[i]]
            }
        }

        return typeof dict === 'string' ? dict : ''
    }
}

export default new CloudSyncLangClass()
