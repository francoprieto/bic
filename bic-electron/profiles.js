/**
 * Gestión de Perfiles de Configuración
 * Permite crear, editar, eliminar y cambiar entre perfiles
 */

class ProfileManager {
  constructor() {
    this.currentProfile = 'default';
    this.profiles = this.loadProfiles();
  }

  /**
   * Carga todos los perfiles desde localStorage
   */
  loadProfiles() {
    const stored = localStorage.getItem('profiles');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Error al cargar perfiles:', e);
      }
    }
    
    // Perfil por defecto
    return {
      'default': {
        name: 'Por defecto',
        config: this.getDefaultConfig(),
        isDefault: true
      }
    };
  }

  /**
   * Guarda todos los perfiles en localStorage
   */
  saveProfiles() {
    localStorage.setItem('profiles', JSON.stringify(this.profiles));
  }

  /**
   * Obtiene la configuración por defecto
   */
  getDefaultConfig() {
    return {
      posicion: 'ci',
      pagina: 'pp',
      numeroPagina: '',
      alto: '40',
      largo: '160',
      ms: '50',
      mi: '50',
      ml: '50',
      mr: '50',
      manual: false,
      inseguro: false,
      directorio: '',
      proxy: '',
      firmaImagen: 'default' // 'default' o nombre de archivo personalizado
    };
  }

  /**
   * Obtiene la configuración del perfil actual
   */
  getCurrentConfig() {
    const profile = this.profiles[this.currentProfile];
    return profile ? profile.config : this.getDefaultConfig();
  }

  /**
   * Guarda la configuración en el perfil actual
   */
  saveCurrentConfig(config) {
    if (this.profiles[this.currentProfile]) {
      this.profiles[this.currentProfile].config = config;
      this.saveProfiles();
      return true;
    }
    return false;
  }

  /**
   * Crea un nuevo perfil
   */
  createProfile(name) {
    if (!name || name.trim() === '') {
      return { success: false, message: 'El nombre del perfil no puede estar vacío' };
    }

    const profileId = this.generateProfileId(name);
    
    if (this.profiles[profileId]) {
      return { success: false, message: 'Ya existe un perfil con ese nombre' };
    }

    this.profiles[profileId] = {
      name: name.trim(),
      config: this.getDefaultConfig(),
      isDefault: false
    };

    this.saveProfiles();
    return { success: true, profileId };
  }

  /**
   * Elimina un perfil
   */
  deleteProfile(profileId) {
    if (profileId === 'default') {
      return { success: false, message: 'No se puede eliminar el perfil por defecto' };
    }

    if (!this.profiles[profileId]) {
      return { success: false, message: 'El perfil no existe' };
    }

    delete this.profiles[profileId];
    
    // Si el perfil eliminado era el actual, cambiar a default
    if (this.currentProfile === profileId) {
      this.currentProfile = 'default';
    }

    this.saveProfiles();
    return { success: true };
  }

  /**
   * Cambia al perfil especificado
   */
  switchProfile(profileId) {
    if (!this.profiles[profileId]) {
      return { success: false, message: 'El perfil no existe' };
    }

    this.currentProfile = profileId;
    localStorage.setItem('currentProfile', profileId);
    return { success: true, config: this.profiles[profileId].config };
  }

  /**
   * Obtiene todos los perfiles
   */
  getAllProfiles() {
    return Object.keys(this.profiles).map(id => ({
      id,
      name: this.profiles[id].name,
      isDefault: this.profiles[id].isDefault || false
    }));
  }

  /**
   * Genera un ID único para el perfil
   */
  generateProfileId(name) {
    return name.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Obtiene el perfil actual
   */
  getCurrentProfileId() {
    return this.currentProfile;
  }

  /**
   * Inicializa el perfil actual desde localStorage
   */
  initCurrentProfile() {
    const stored = localStorage.getItem('currentProfile');
    if (stored && this.profiles[stored]) {
      this.currentProfile = stored;
    } else {
      this.currentProfile = 'default';
    }
  }
}

// Exportar para uso global
window.ProfileManager = ProfileManager;
