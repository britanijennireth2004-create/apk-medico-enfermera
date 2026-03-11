/**
 * Utility functions for the APK
 */

export function calculateAge(birthDate) {
    if (!birthDate) return '--';
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
}

export function formatTime(date) {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateShort(date) {
    return new Date(date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}
