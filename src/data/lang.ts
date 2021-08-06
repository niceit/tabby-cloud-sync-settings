const CloudSyncLang = {
    lang: {
        common: {
            menu_title: 'Settings Sync'
        },
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
        sync: {
            sync_confirmation: 'We found cloud setting. Please choose the sync direction!',
            error_invalid_setting: 'Your setting cloud file contains invalid settings. Local file synced up instead!',
            error_invalid_setting_2: 'Your sync config is invalid. Please re-configure it!',
            error_save_setting: 'Something wrong! unable to save settings.',
            need_to_save_config: 'Please save your config first',
            sync_success: 'Your saved settings was synced to the cloud.',
            sync_error: 'Unable to sync your setting. Please check the configuration!',
            sync_server_failed: 'Sync file to the cloud failed. Please check your cloud service!',
            sync_enabled: 'Sync feature enabled.',
            sync_disabled: 'Sync feature disabled.',
            confirm_remove_setting: 'Are you sure want to remove saved config?',
            remove_setting_success: 'Your settings had been removed.',
            remove_setting_error: 'Can not remove your setting. Try again later!',
        },
        buttons: {
            sync_from_cloud: 'Sync Cloud Settings',
            sync_from_local: 'Upload Local Settings',
            check_update: 'Check for updates',
            yes: 'Yes',
            cancel: 'Cancel',
            no: 'No',
            ok: 'Ok',
        },
    },

    trans: (key: string): string => {
        let dict = CloudSyncLang.lang
        const objects = key.split('.')
        for (const i in objects) {
            if (typeof dict[objects[i]] !== 'undefined') {
                dict = dict[objects[i]]
            }
        }

        return typeof dict === 'string' ? dict : ''
    }
}

export default CloudSyncLang
