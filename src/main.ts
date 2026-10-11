import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { registerServiceWorker } from './lib/pwa.svelte';

mount(App, { target: document.getElementById('app')! });
registerServiceWorker();
