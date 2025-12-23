
import { auth } from './storage';
import { dbService } from './db';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';

export const authService = {
    // Beobachter für Login-Status
    onAuthStateChanged: (callback: (user: firebase.User | null) => void) => {
        if (!auth) {
            callback(null);
            return () => {};
        }
        return auth.onAuthStateChanged(callback);
    },

    login: async (email: string, pass: string) => {
        if (!auth) throw new Error("Cloud nicht verfügbar.");
        try {
            const result = await auth.signInWithEmailAndPassword(email, pass);
            
            // Nach dem Login erzwingen wir einen Sync, um sicherzustellen, 
            // dass wir die Daten dieses spezifischen Users laden.
            await dbService.syncActivities();
            
            return result.user;
        } catch (error: any) {
            console.error("Login Error:", error);
            throw translateAuthError(error.code);
        }
    },

    register: async (email: string, pass: string) => {
        if (!auth) throw new Error("Cloud nicht verfügbar.");
        try {
            const result = await auth.createUserWithEmailAndPassword(email, pass);
            // Neue Benutzer starten immer ohne lokale Altdaten
            return result.user;
        } catch (error: any) {
            console.error("Register Error:", error);
            throw translateAuthError(error.code);
        }
    },

    logout: async () => {
        if (!auth) return;
        try {
            // WICHTIG: Bevor wir ausloggen, löschen wir alle lokalen Farm-Daten vom PC.
            // Das verhindert, dass der nächste Benutzer (am selben PC/Browser) die Daten sieht.
            const keysToRemove = [
                'agritrack_settings_full',
                'agritrack_activities',
                'agritrack_fields',
                'agritrack_storage',
                'agritrack_profile',
                'agritrack_equipment',
                'agritrack_tillage_categories',
                'lastSyncSuccess',
                'agritrack_guest_mode'
            ];
            keysToRemove.forEach(key => localStorage.removeItem(key));
            
            await auth.signOut();
            // Seite neu laden um alle States sauber zu resetten
            window.location.reload();
        } catch (error) {
            console.error("Logout Error:", error);
        }
    },

    resetPassword: async (email: string) => {
        if (!auth) throw new Error("Cloud nicht verfügbar.");
        try {
            await auth.sendPasswordResetEmail(email);
        } catch (error: any) {
            throw translateAuthError(error.code);
        }
    }
};

// Verbesserte Fehlerübersetzung
const translateAuthError = (code: string): Error => {
    switch (code) {
        case 'auth/invalid-email': return new Error('Ungültige E-Mail-Adresse.');
        case 'auth/user-disabled': return new Error('Benutzerkonto deaktiviert.');
        case 'auth/user-not-found': return new Error('Kein Benutzer mit dieser E-Mail gefunden.');
        case 'auth/wrong-password': return new Error('Falsches Passwort.');
        case 'auth/email-already-in-use': return new Error('E-Mail wird bereits verwendet.');
        case 'auth/weak-password': return new Error('Passwort muss mindestens 6 Zeichen haben.');
        case 'auth/invalid-credential': return new Error('Zugangsdaten ungültig.');
        case 'auth/operation-not-allowed': return new Error('Login-Methode nicht aktiviert.');
        case 'auth/network-request-failed': return new Error('Netzwerkfehler. Bitte Internetverbindung prüfen.');
        default: return new Error(`Fehler: ${code}`);
    }
};

