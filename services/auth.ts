import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut as firebaseSignOut, 
    onAuthStateChanged,
    sendPasswordResetEmail,
    User
} from 'firebase/auth';
import { auth } from './storage';
import { dbService } from './db';

export const authService = {
    // Beobachter für Login-Status
    onAuthStateChanged: (callback: (user: User | null) => void) => {
        if (!auth) {
            callback(null);
            return () => {};
        }
        return onAuthStateChanged(auth, callback);
    },

    login: async (email: string, pass: string) => {
        if (!auth) throw new Error("Cloud nicht verfügbar.");
        try {
            const result = await signInWithEmailAndPassword(auth, email, pass);
            // Nach Login: Prüfen ob lokale Daten migriert werden müssen
            await dbService.migrateGuestDataToCloud();
            return result.user;
        } catch (error: any) {
            console.error("Login Error:", error);
            throw translateAuthError(error.code);
        }
    },

    register: async (email: string, pass: string) => {
        if (!auth) throw new Error("Cloud nicht verfügbar.");
        try {
            const result = await createUserWithEmailAndPassword(auth, email, pass);
            // Neue User haben leere Cloud, wir schieben lokale Daten hoch
            await dbService.migrateGuestDataToCloud();
            return result.user;
        } catch (error: any) {
            console.error("Register Error:", error);
            throw translateAuthError(error.code);
        }
    },

    logout: async () => {
        if (!auth) return;
        try {
            await firebaseSignOut(auth);
            // Optional: Lokale Daten löschen bei Logout? 
            // Fürs erste behalten wir sie, damit man offline weiterarbeiten kann.
        } catch (error) {
            console.error("Logout Error:", error);
        }
    },

    resetPassword: async (email: string) => {
        if (!auth) throw new Error("Cloud nicht verfügbar.");
        try {
            await sendPasswordResetEmail(auth, email);
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
        case 'auth/operation-not-allowed': return new Error('Login-Methode nicht aktiviert. Bitte Admin kontaktieren (Firebase Console).');
        case 'auth/network-request-failed': return new Error('Netzwerkfehler. Bitte Internetverbindung prüfen.');
        default: return new Error(`Fehler: ${code}`); // Zeigt den echten Code an, falls unbekannt
    }
};
