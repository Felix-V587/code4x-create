app.post('/auth/register', zValidator('json', CreateUserSchema), (c) => c.json({ ok: true }))
