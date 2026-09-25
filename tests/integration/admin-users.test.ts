import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accessToken, env, makeAccount, service, signIn, uniqueName } from './support.ts';

async function callAdminUsers(token: string, body: unknown) {
  const res = await fetch(`${env.url}/functions/v1/admin-users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: env.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('admin-users edge function', () => {
  const created: string[] = [];
  let adminId: string;
  let adminToken: string;

  beforeAll(async () => {
    const adminName = uniqueName('it_admin');
    adminId = await makeAccount(adminName, 'admin');
    created.push(adminId);
    adminToken = await accessToken(await signIn(adminName));
  });

  afterAll(async () => {
    for (const id of created) await service.auth.admin.deleteUser(id);
  });

  it('lets an admin create a panelist who can then sign in', async () => {
    const username = uniqueName('it_pan');
    const res = await callAdminUsers(adminToken, {
      action: 'create', username, displayName: 'Integration Panelist', role: 'panelist', password: 'panel-pass-1',
    });
    expect(res.status).toBe(200);
    created.push(res.body.user_id as string);

    const panelist = await signIn(username, 'panel-pass-1');
    const { data: profile } = await panelist.from('profiles').select('role, display_name').eq('username', username).single();
    expect(profile).toEqual({ role: 'panelist', display_name: 'Integration Panelist' });
  });

  it('refuses callers who are not admins', async () => {
    const username = uniqueName('it_qm');
    created.push(await makeAccount(username, 'queue_manager'));
    const qmToken = await accessToken(await signIn(username));
    const res = await callAdminUsers(qmToken, {
      action: 'create', username: uniqueName('it_x'), displayName: 'X', role: 'panelist', password: 'panel-pass-1',
    });
    expect(res).toEqual({ status: 403, body: { error: 'Not allowed' } });
  });

  it('rejects invalid input and duplicate usernames', async () => {
    const bad = await callAdminUsers(adminToken, {
      action: 'create', username: 'x', displayName: 'X', role: 'panelist', password: 'panel-pass-1',
    });
    expect(bad).toEqual({
      status: 400,
      body: { error: 'Username must be 3 to 32 characters: lowercase letters, digits or _' },
    });

    const username = uniqueName('it_dup');
    const first = await callAdminUsers(adminToken, {
      action: 'create', username, displayName: 'Dup', role: 'panelist', password: 'panel-pass-1',
    });
    created.push(first.body.user_id as string);
    const second = await callAdminUsers(adminToken, {
      action: 'create', username, displayName: 'Dup', role: 'panelist', password: 'panel-pass-1',
    });
    expect(second).toEqual({ status: 400, body: { error: 'Username already taken' } });
  });

  it('disables and re-enables an account', async () => {
    const username = uniqueName('it_dis');
    const userId = await makeAccount(username, 'panelist');
    created.push(userId);

    expect((await callAdminUsers(adminToken, { action: 'set_active', userId, active: false })).status).toBe(200);
    await expect(signIn(username)).rejects.toThrow();
    const { data: profile } = await service.from('profiles').select('is_active').eq('id', userId).single();
    expect(profile?.is_active).toBe(false);

    expect((await callAdminUsers(adminToken, { action: 'set_active', userId, active: true })).status).toBe(200);
    await expect(signIn(username)).resolves.toBeTruthy();
  });

  it('will not let an admin disable themselves', async () => {
    const res = await callAdminUsers(adminToken, { action: 'set_active', userId: adminId, active: false });
    expect(res).toEqual({ status: 400, body: { error: 'You cannot disable your own account' } });
  });

  it('issues access tokens that expire within 10 minutes, so a disabled account soon loses live updates', async () => {
    const username = uniqueName('it_ttl');
    created.push(await makeAccount(username, 'panelist'));
    const token = await accessToken(await signIn(username));
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
  });

  it('resets a password', async () => {
    const username = uniqueName('it_pw');
    const userId = await makeAccount(username, 'panelist');
    created.push(userId);

    expect((await callAdminUsers(adminToken, { action: 'reset_password', userId, password: 'brand-new-pass' })).status).toBe(200);
    await expect(signIn(username)).rejects.toThrow();
    await expect(signIn(username, 'brand-new-pass')).resolves.toBeTruthy();
  });
});
