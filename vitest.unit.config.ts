import { UserConfig, configDefaults } from "vitest/config";
import config from "./vitest.config";

export default {
    ...config,
    test: {
        ...config.test,
        exclude: [...configDefaults.exclude, "**/suite/**"],
    },
} as UserConfig;
