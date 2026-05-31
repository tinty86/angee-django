import {
  ConsoleShell,
  LoginPage,
  createApp,
  type BaseAddon,
} from "@angee/base";
import { cacheConfigFromSDL } from "@angee/sdk";
import notes from "@angee-example/notes-web";

import publicSDL from "../../runtime/schemas/public.graphql?raw";
import consoleSDL from "../../runtime/schemas/console.graphql?raw";
import { DemoCredentials } from "./demo-auth";
import "./index.css";

const authAddon: BaseAddon = {
  id: "auth",
  routes: [
    {
      name: "auth.login",
      path: "/login",
      shell: "public",
      component: () => (
        <LoginPage redirectTo="/notes" footer={<DemoCredentials />} />
      ),
    },
  ],
};

createApp({
  addons: [notes, authAddon],
  shells: {
    console: { chrome: ConsoleShell },
    public: { chrome: ({ children }) => children, requireAuth: false },
  },
  schemas: {
    public: { url: "/graphql/public/", cache: cacheConfigFromSDL(publicSDL) },
    console: { url: "/graphql/console/", cache: cacheConfigFromSDL(consoleSDL) },
  },
  home: "/notes",
}).mount("#root");
