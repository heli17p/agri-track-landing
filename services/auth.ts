
import { auth } from './storage';
import { dbService } from './db';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';

export const authService = {
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
            return result.user;
        } catch (error: any) {
            throw translateAuthError(error.code);
        }
    },

    register: async (email: string, pass: string) => {
        if (!auth) throw new Error("Cloud nicht verfügbar.");
        try {
            const result = await auth.createUserWithEmailAndPassword(email, pass);
            if (result.user) {
                // Sende Verifizierungs-E-Mail sofort nach Registrierung
                await result.user.sendEmailVerification();
            }
            return result.user;
        } catch (error: any) {
            throw translateAuthError(error.code);
        }
    },

    sendVerificationEmail: async () => {
        if (auth?.currentUser) {
            await auth.currentUser.sendEmailVerification();
        }
    },

    reloadUser: async () => {
        if (auth?.currentUser) {
            await auth.currentUser.reload();
            return auth.currentUser;
        }
        return null;
    },

    logout: async () => {
        if (!auth) return;
        try {
            // WICHTIG: Alle lokalen Daten löschen, damit der nächste User am PC nichts sieht
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

const translateAuthError = (code: string): Error => {
    switch (code) {
        case 'auth/invalid-email': return new Error('Ungültige E-Mail-Adresse.');
        case 'auth/user-disabled': return new Error('Benutzerkonto deaktiviert.');
        case 'auth/user-not-found': return new Error('Konto nicht gefunden.');
        case 'auth/wrong-password': return new Error('Falsches Passwort.');
        case 'auth/email-already-in-use': return new Error('Diese E-Mail wird bereits verwendet.');
        case 'auth/weak-password': return new Error('Passwort muss mindestens 6 Zeichen haben.');
        default: return new Error(`Fehler: ${code}`);
    }
};

