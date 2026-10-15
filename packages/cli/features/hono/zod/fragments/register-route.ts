app.post('/auth/register', zValidator('json', CreateUserSchema, validationHook), (c) =>
  c.json({ ok: true }),
)
