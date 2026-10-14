app.post(
  '/auth/register',
  describeRoute({
    tags: ['auth'],
    summary: 'Register a new user',
    requestBody: { content: { 'application/json': { schema: resolver(CreateUserSchema) } } },
    responses: {
      201: {
        description: 'User created',
        content: { 'application/json': { schema: resolver(RegisterResponseSchema) } },
      },
    },
  }),
  zValidator('json', CreateUserSchema, validationHook),
  (c) => c.json({ ok: true }),
)
