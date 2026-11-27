export class AuthService {
  constructor(client) { this.client = client; }

  async login(username, password) {
    const { data, error } = await this.client.functions.invoke('username-login', {
      body: { username: username.trim(), password }
    });
    if (error) throw new Error(await readableFunctionError(error));
    if (!data?.access_token || !data?.refresh_token) throw new Error(data?.error || 'Unable to sign in. Check your credentials.');
    const { error: sessionError } = await this.client.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
    if (sessionError) throw sessionError;
    return this.getProfile();
  }

  async getProfile() {
    const { data: { user }, error: authError } = await this.client.auth.getUser();
    if (authError || !user) throw new Error('Your session has expired. Please sign in again.');
    const { data, error } = await this.client.from('profiles').select('id,full_name,username,role,status,contact_number,designation,joined_at,must_change_password').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!data || data.status !== 'ACTIVE') throw new Error('This account is disabled or has not been provisioned. Contact your administrator.');
    return data;
  }

  async logout() { return this.client.auth.signOut(); }
  onChange(callback) { return this.client.auth.onAuthStateChange(callback); }
}

async function readableFunctionError(error) {
  try {
    if (error.context instanceof Response) {
      const payload = await error.context.clone().json();
      return payload.error || payload.message || 'Unable to sign in. Check your credentials.';
    }
  } catch { /* use safe generic message */ }
  return 'Unable to sign in. Check your username and password.';
}
