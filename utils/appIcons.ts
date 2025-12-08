

// Tractor Path Definition (Clean Side View)
const TRACTOR_PATH = "M112,336c-26.5,0-48,21.5-48,48s21.5,48,48,48s48-21.5,48-48S138.5,336,112,336z M400,256c-44.2,0-80,35.8-80,80s35.8,80,80,80s80-35.8,80-80S444.2,256,400,256z M180,288h-40v-64h-32v64h-20v80h56v35.6c6.2-1.9,12.7-2.9,19.4-3.2c0.2-10.3,1.8-20.4,4.7-30.1c8.4-28,29.3-49.8,56.5-59.5V208c0-8.8,7.2-16,16-16h96c8.8,0,16,7.2,16,16v89.4c17.5,6,33.3,16.5,45.7,30.3V256h-88v-48h-64v80h16.5c-2.4,5.1-4.4,10.4-5.9,15.9c-0.1,0.4-0.2,0.7-0.3,1.1H180V288z M352,208h48v32h-48V208z";

export interface IconTheme {
    id: string;
    label: string;
    bg: string;
    fg: string;
}

export const ICON_THEMES: IconTheme[] = [
    { id: 'standard', label: 'AgriTrack', bg: '#16a34a', fg: 'white' },
    { id: 'steyr', label: 'Steyr', bg: '#EF4444', fg: 'white' },
    { id: 'lindner', label: 'Lindner', bg: '#DC2626', fg: '#E5E7EB' }, // Red / Light Grey
    { id: 'johndeere', label: 'John Deere', bg: '#367C2B', fg: '#FFDE00' },
    { id: 'newholland', label: 'New Holland', bg: '#004892', fg: '#FDD017' },
    { id: 'fendt', label: 'Fendt', bg: '#344e41', fg: '#e2e8f0' }, // Dark Green / Grey
    { id: 'deutz', label: 'Deutz-Fahr', bg: '#75B82A', fg: '#1e3a8a' }, // Light Green / Dark Blue
    { id: 'lambo', label: 'Lamborghini', bg: '#ffffff', fg: '#000000' }, // White / Black
    { id: 'case', label: 'Case IH', bg: '#991b1b', fg: 'white' }, // Dark Red
    { id: 'claas', label: 'Claas', bg: '#9EB543', fg: '#EF4444' }, // Seed Green / Red
    { id: 'massey', label: 'Massey', bg: '#B91C1C', fg: 'white' },
    { id: 'dark', label: 'Dark Mode', bg: '#1e293b', fg: 'white' },
];

export const getAppIcon = (themeId: string): string => {
    const theme = ICON_THEMES.find(t => t.id === themeId) || ICON_THEMES[0];
    
    // For Lamborghini (White bg), we need a border/stroke to see it against white header
    const border = theme.bg === '#ffffff' ? `stroke="#e2e8f0" stroke-width="10"` : '';

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
        <rect width="512" height="512" rx="120" fill="${theme.bg}" ${border}/>
        <path fill="${theme.fg}" d="${TRACTOR_PATH}"/>
    </svg>
    `;
    
    return `data:image/svg+xml;base64,${btoa(svg)}`;
};