import {ConfigService, PlatformService} from "terminus-core";
import {ToastrService} from "ngx-toastr";
import {GistParams} from "../../../interface";
import Github from "./github";
import SettingsHelper from "../../settings-helper";

class Gists {
    sync = async (config: ConfigService, platform: PlatformService, toast: ToastrService, params: GistParams, firstInit = false) => {
        let $component = null
        switch (params.type) {
            case 'github': {
                $component = new Github(params.id, params.accessToken)
            }
        }

        if ($component) {
            return $component.sync(config, platform, toast, params, firstInit)
        }

        return false
    }

    syncLocalSettingsToCloud = async (platform: PlatformService, toast: ToastrService) => {
        const configs = SettingsHelper.readConfigFile(platform).configs

        let $component = null
        switch (configs.type) {
            case 'github': {
                $component = new Github(configs.id, configs.accessToken)
            }
        }

        if ($component) {
            return $component.syncLocalSettingsToCloud(platform, toast, null)
        }
    }
}

export default new Gists()
