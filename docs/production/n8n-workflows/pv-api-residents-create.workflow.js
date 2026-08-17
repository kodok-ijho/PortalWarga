/**
 * PV API - Residents Create
 * Workflow ID: LkUJdTKvdspl3hK4
 */
module.exports = {
  "success": true,
  "data": {
    "updatedAt": "2026-08-17T11:02:21.989Z",
    "createdAt": "2026-07-18T16:40:56.356Z",
    "id": "LkUJdTKvdspl3hK4",
    "name": "PV API - Residents Create",
    "description": null,
    "active": true,
    "isArchived": false,
    "nodes": [
      {
        "id": "webhook_residents_create",
        "name": "POST /portal-v1/residents/create",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2.1,
        "position": [
          220,
          300
        ],
        "parameters": {
          "httpMethod": "POST",
          "path": "portal-v1/residents/create",
          "authentication": "none",
          "responseMode": "responseNode",
          "options": {
            "allowedOrigins": "https://portal-warga.vercel.app,http://localhost:5173,http://127.0.0.1:5173",
            "ignoreBots": true
          }
        },
        "webhookId": "3fff8bf4-a86a-40bb-bfc7-21e3593db6e5"
      },
      {
        "id": "extract_token",
        "name": "Extract Bearer Token",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [
          500,
          300
        ],
        "parameters": {
          "mode": "runOnceForAllItems",
          "language": "javaScript",
          "jsCode": "const source = $input.first()?.json ?? {};\nconst body = source.body ?? {};\nconst query = source.query ?? {};\nconst headers = source.headers ?? {};\nconst now = new Date().toISOString();\nconst requestId = headers['x-request-id'] || headers['X-Request-Id'] || body.request_id || query.request_id || 'res_create_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\nconst authHeader = headers['x-portal-authorization'] || headers['X-Portal-Authorization'] || headers.authorization || headers.Authorization || '';\nconst match = String(authHeader).match(/^Bearer\\s+(.+)$/i);\n\nfunction failure(statusCode, code, message, details = {}) {\n  return {\n    statusCode,\n    response: {\n      ok: false,\n      data: null,\n      error: { code, message, details },\n      meta: { request_id: requestId, timestamp: now }\n    }\n  };\n}\n\nif (!match || !match[1]) {\n  return [{\n    json: {\n      tokenPresent: false,\n      ...failure(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan. Silakan login.', {})\n    }\n  }];\n}\n\nreturn [{\n  json: {\n    tokenPresent: true,\n    token: match[1].trim(),\n    request_id: requestId,\n    timestamp: now\n  }\n}];"
        }
      },
      {
        "id": "token_present",
        "name": "Token Present?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.3,
        "position": [
          760,
          300
        ],
        "parameters": {
          "conditions": {
            "combinator": "and",
            "conditions": [
              {
                "leftValue": "={{ $json.tokenPresent }}",
                "operator": {
                  "operation": "true",
                  "type": "boolean"
                },
                "rightValue": true
              }
            ]
          }
        }
      },
      {
        "id": "verify_token",
        "name": "Verify App JWT",
        "type": "n8n-nodes-base.jwt",
        "typeVersion": 1,
        "position": [
          1040,
          220
        ],
        "parameters": {
          "algorithm": "HS256",
          "clockTolerance": 30,
          "complete": false,
          "ignoreExpiration": false,
          "ignoreNotBefore": false,
          "operation": "verify",
          "token": "={{ $json.token }}"
        },
        "credentials": {
          "jwtAuth": {
            "id": "c0csItRMf2TBalU4",
            "name": "PV App JWT"
          }
        },
        "onError": "continueRegularOutput"
      },
      {
        "id": "validate_claims",
        "name": "Validate App Claims",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [
          1310,
          220
        ],
        "parameters": {
          "mode": "runOnceForAllItems",
          "language": "javaScript",
          "jsCode": "const input = $input.first()?.json ?? {};\nconst payload = input.payload && typeof input.payload === 'object' ? input.payload : input;\nconst now = new Date().toISOString();\nlet requestId = input.request_id || input.requestId || null;\ntry {\n  const extractedItems = $items('Extract Bearer Token', 0, 0);\n  requestId = extractedItems?.[0]?.json?.request_id || requestId;\n} catch (error) {}\n\nrequestId = requestId || 'res_create_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\nconst expectedIssuer = 'portal-palm-village';\nconst expectedAudience = 'portal-palm-village-web';\n\nfunction failure(statusCode, code, message, details = {}) {\n  return {\n    claimsValid: false,\n    request_id: requestId,\n    timestamp: now,\n    statusCode,\n    response: {\n      ok: false,\n      data: null,\n      error: { code, message, details },\n      meta: { request_id: requestId, timestamp: now }\n    }\n  };\n}\n\nconst aud = payload.aud;\nconst audienceOk = Array.isArray(aud) ? aud.includes(expectedAudience) : aud === expectedAudience;\n\nif (payload.iss !== expectedIssuer || !audienceOk || !payload.sub) {\n  return [{ json: failure(401, 'INVALID_TOKEN', 'Sesi tidak valid. Silakan login ulang.', {}) }];\n}\n\nreturn [{\n  json: {\n    claimsValid: true,\n    request_id: requestId,\n    timestamp: now,\n    sub: payload.sub,\n    email: payload.email ?? null,\n    role: payload.role ?? null,\n    unit_id: payload.unit_id ?? null,\n    approval_status: payload.approval_status ?? null\n  }\n}];"
        }
      },
      {
        "id": "claims_valid",
        "name": "Claims Valid?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.3,
        "position": [
          1580,
          220
        ],
        "parameters": {
          "conditions": {
            "combinator": "and",
            "conditions": [
              {
                "leftValue": "={{ $json.claimsValid }}",
                "operator": {
                  "operation": "true",
                  "type": "boolean"
                },
                "rightValue": true
              }
            ]
          }
        }
      },
      {
        "id": "fetch_profile",
        "name": "Fetch Actor Profile",
        "type": "n8n-nodes-base.supabase",
        "typeVersion": 1,
        "position": [
          1860,
          120
        ],
        "parameters": {
          "filterType": "manual",
          "filters": {
            "conditions": [
              {
                "condition": "eq",
                "keyName": "id",
                "keyValue": "={{ $json.sub }}"
              }
            ]
          },
          "limit": 1,
          "matchType": "allFilters",
          "operation": "getAll",
          "resource": "row",
          "returnAll": false,
          "tableId": "profiles"
        },
        "credentials": {
          "supabaseApi": {
            "id": "yIZ9pdIj39ToovM3",
            "name": "PV Supabase Service Role"
          }
        },
        "alwaysOutputData": true
      },
      {
        "id": "authorize_actor",
        "name": "Authorize Actor",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [
          2140,
          120
        ],
        "parameters": {
          "mode": "runOnceForAllItems",
          "language": "javaScript",
          "jsCode": "const profile = $input.first()?.json ?? {};\nconst now = new Date().toISOString();\nlet requestId = null;\ntry { requestId = $items('Validate App Claims', 0, 0)?.[0]?.json?.request_id || null; } catch (error) {}\nrequestId = requestId || 'res_create_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\nconst minimumRole = 'pengurus';\nconst rank = { warga: 10, pengurus: 20, bendahara: 30, admin: 40 };\nfunction failure(statusCode, code, message, details = {}) {\n  return { authorized: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n}\nif (!profile.id) { return [{ json: failure(401, 'INVALID_TOKEN', 'Sesi tidak valid. Silakan login ulang.', {}) }]; }\nif (profile.is_active !== true) { return [{ json: failure(403, 'SUSPENDED_USER', 'Akun tidak aktif. Hubungi pengurus.', {}) }]; }\nif (profile.approval_status !== 'approved') { return [{ json: failure(403, 'FORBIDDEN', 'Akun belum dapat mengakses endpoint ini.', { approval_status: profile.approval_status ?? null }) }]; }\nconst actorRank = rank[profile.role] || 0;\nconst minimumRank = rank[minimumRole];\nif (actorRank < minimumRank) {\n  return [{ json: failure(403, 'FORBIDDEN_ROLE', 'Akses ditolak.', { required_role: minimumRole, actor_role: profile.role ?? null }) }];\n}\nreturn [{ json: { authorized: true, request_id: requestId, timestamp: now, actor: { id: profile.id, email: profile.email, role: profile.role } } }];"
        }
      },
      {
        "id": "actor_authorized",
        "name": "Actor Authorized?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.3,
        "position": [
          2420,
          120
        ],
        "parameters": {
          "conditions": {
            "combinator": "and",
            "conditions": [
              {
                "leftValue": "={{ $json.authorized }}",
                "operator": {
                  "operation": "true",
                  "type": "boolean"
                },
                "rightValue": true
              }
            ]
          }
        }
      },
      {
        "id": "validate_inputs",
        "name": "Validate & Prepare Inputs",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [
          2700,
          20
        ],
        "parameters": {
          "mode": "runOnceForAllItems",
          "language": "javaScript",
          "jsCode": "let auth = {};\ntry { auth = $items('Authorize Actor', 0, 0)?.[0]?.json ?? {}; } catch (e) {}\nconst webhook = $items('POST /portal-v1/residents/create', 0, 0)?.[0]?.json ?? {};\nconst body = webhook.body ?? {};\nconst requestId = auth.request_id || 'res_create_' + Date.now();\nconst now = new Date().toISOString();\n\nfunction failure(statusCode, code, message, details = {}) {\n  return { inputsValid: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n}\n\nconst fullName = String(body.full_name || body.fullName || '').trim();\nconst email = String(body.email || '').trim().toLowerCase();\nconst phone = String(body.phone || '').trim() || null;\nconst role = String(body.role || 'warga').trim().toLowerCase();\nconst unitId = body.unit_id ? Number(body.unit_id) : null;\nconst occupancyStatus = body.occupancy_status || null;\n\nif (!fullName) {\n  return [{ json: failure(400, 'BAD_REQUEST', 'Nama lengkap wajib diisi.') }];\n}\nif (email && !email.includes('@')) {\n  return [{ json: failure(400, 'BAD_REQUEST', 'Format email tidak valid.') }];\n}\n\n// If email is not provided, generate a unique placeholder email\nif (!email) {\n  const cleanUnit = unitId ? `unit_${unitId}` : 'unassigned';\n  const rand = Math.random().toString(36).substring(2, 8);\n  email = `${cleanUnit}.${rand}@warga.palmvillage.local`;\n}\n\n// Generate a unique placeholder google_sub\nconst tempSub = 'placeholder_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now();\n\nreturn [{\n  json: {\n    inputsValid: true,\n    request_id: requestId,\n    timestamp: now,\n    actor_id: auth.actor?.id || null,\n    actor_email: auth.actor?.email || null,\n    profile: {\n      google_sub: tempSub,\n      email,\n      full_name: fullName,\n      phone,\n      role,\n      unit_id: unitId,\n      approval_status: 'approved',\n      is_active: body.is_active !== false\n    },\n    unit_id: unitId,\n    occupancy_status: occupancyStatus\n  }\n}];"
        }
      },
      {
        "id": "inputs_valid",
        "name": "Inputs Valid?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.3,
        "position": [
          2960,
          20
        ],
        "parameters": {
          "conditions": {
            "combinator": "and",
            "conditions": [
              {
                "leftValue": "={{ $json.inputsValid }}",
                "operator": {
                  "operation": "true",
                  "type": "boolean"
                },
                "rightValue": true
              }
            ]
          }
        }
      },
      {
        "id": "insert_profile",
        "name": "Insert Profile",
        "type": "n8n-nodes-base.supabase",
        "typeVersion": 1,
        "position": [
          3220,
          -100
        ],
        "parameters": {
          "operation": "create",
          "tableId": "profiles",
          "resource": "row",
          "dataToSend": "defineBelow",
          "fieldsUi": {
            "fieldValues": [
              {
                "fieldId": "google_sub",
                "fieldValue": "={{ $json.profile.google_sub }}"
              },
              {
                "fieldId": "email",
                "fieldValue": "={{ $json.profile.email }}"
              },
              {
                "fieldId": "full_name",
                "fieldValue": "={{ $json.profile.full_name }}"
              },
              {
                "fieldId": "phone",
                "fieldValue": "={{ $json.profile.phone }}"
              },
              {
                "fieldId": "role",
                "fieldValue": "={{ $json.profile.role }}"
              },
              {
                "fieldId": "unit_id",
                "fieldValue": "={{ $json.profile.unit_id }}"
              },
              {
                "fieldId": "approval_status",
                "fieldValue": "={{ $json.profile.approval_status }}"
              },
              {
                "fieldId": "is_active",
                "fieldValue": "={{ $json.profile.is_active }}"
              }
            ]
          }
        },
        "credentials": {
          "supabaseApi": {
            "id": "yIZ9pdIj39ToovM3",
            "name": "PV Supabase Service Role"
          }
        }
      },
      {
        "id": "check_unit_update",
        "name": "Should Update Unit?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.3,
        "position": [
          3500,
          -100
        ],
        "parameters": {
          "conditions": {
            "options": {
              "caseSensitive": true,
              "leftValue": "",
              "typeValidation": "strict",
              "version": 2
            },
            "combinator": "and",
            "conditions": [
              {
                "leftValue": "={{ String($('Validate & Prepare Inputs').item.json.unit_id || '') }}",
                "operator": {
                  "type": "string",
                  "operation": "notEmpty"
                }
              },
              {
                "leftValue": "={{ String($('Validate & Prepare Inputs').item.json.occupancy_status || '') }}",
                "operator": {
                  "type": "string",
                  "operation": "notEmpty"
                }
              }
            ]
          },
          "looseTypeValidation": false
        }
      },
      {
        "id": "update_unit_occupancy",
        "name": "Update Unit Occupancy",
        "type": "n8n-nodes-base.supabase",
        "typeVersion": 1,
        "position": [
          3760,
          -220
        ],
        "parameters": {
          "operation": "update",
          "tableId": "units",
          "resource": "row",
          "filterType": "manual",
          "matchType": "allFilters",
          "filters": {
            "conditions": [
              {
                "keyName": "id",
                "condition": "eq",
                "keyValue": "={{ $('Validate & Prepare Inputs').item.json.unit_id }}"
              }
            ]
          },
          "dataToSend": "defineBelow",
          "fieldsUi": {
            "fieldValues": [
              {
                "fieldId": "occupancy_status",
                "fieldValue": "={{ $('Validate & Prepare Inputs').item.json.occupancy_status }}"
              },
              {
                "fieldId": "is_occupied",
                "fieldValue": "true"
              }
            ]
          }
        },
        "credentials": {
          "supabaseApi": {
            "id": "yIZ9pdIj39ToovM3",
            "name": "PV Supabase Service Role"
          }
        }
      },
      {
        "id": "build_audit_log",
        "name": "Build Audit Log Row",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [
          4040,
          -100
        ],
        "parameters": {
          "mode": "runOnceForAllItems",
          "language": "javaScript",
          "jsCode": "let prep = {};\nlet inserted = {};\ntry { prep = $items('Validate & Prepare Inputs', 0, 0)?.[0]?.json ?? {}; } catch (e) {}\ntry { inserted = $items('Insert Profile', 0, 0)?.[0]?.json ?? {}; } catch (e) {}\nconst now = new Date().toISOString();\nconst requestId = prep.request_id;\n\nconst audit = {\n  actor_id: prep.actor_id,\n  action: 'profile.create',\n  entity_type: 'profile',\n  entity_id: inserted.id,\n  metadata: {\n    request_id: requestId,\n    email: prep.profile?.email,\n    full_name: prep.profile?.full_name,\n    role: prep.profile?.role,\n    unit_id: prep.profile?.unit_id,\n    occupancy_status: prep.occupancy_status\n  }\n};\n\nreturn [{ json: { audit, request_id: requestId, timestamp: now, profile: inserted } }];"
        }
      },
      {
        "id": "insert_audit_log",
        "name": "Insert Audit Log",
        "type": "n8n-nodes-base.supabase",
        "typeVersion": 1,
        "position": [
          4300,
          -100
        ],
        "parameters": {
          "operation": "create",
          "tableId": "audit_logs",
          "resource": "row",
          "dataToSend": "defineBelow",
          "fieldsUi": {
            "fieldValues": [
              {
                "fieldId": "actor_id",
                "fieldValue": "={{ $json.audit.actor_id }}"
              },
              {
                "fieldId": "action",
                "fieldValue": "={{ $json.audit.action }}"
              },
              {
                "fieldId": "entity_type",
                "fieldValue": "={{ $json.audit.entity_type }}"
              },
              {
                "fieldId": "entity_id",
                "fieldValue": "={{ $json.audit.entity_id }}"
              },
              {
                "fieldId": "metadata",
                "fieldValue": "={{ JSON.stringify($json.audit.metadata) }}"
              }
            ]
          }
        },
        "credentials": {
          "supabaseApi": {
            "id": "yIZ9pdIj39ToovM3",
            "name": "PV Supabase Service Role"
          }
        }
      },
      {
        "id": "respond_success",
        "name": "Respond Success",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.5,
        "position": [
          4560,
          -100
        ],
        "parameters": {
          "respondWith": "json",
          "responseBody": "={\n  \"ok\": true,\n  \"data\": {\n    \"profile\": {\n      \"id\": \"{{ $node[\"Build Audit Log Row\"].json.profile.id }}\",\n      \"email\": \"{{ $node[\"Build Audit Log Row\"].json.profile.email }}\",\n      \"full_name\": \"{{ $node[\"Build Audit Log Row\"].json.profile.full_name }}\",\n      \"role\": \"{{ $node[\"Build Audit Log Row\"].json.profile.role }}\",\n      \"is_active\": {{ $node[\"Build Audit Log Row\"].json.profile.is_active }}\n    }\n  },\n  \"error\": null,\n  \"meta\": {\n    \"request_id\": \"{{ $node[\"Build Audit Log Row\"].json.request_id }}\",\n    \"timestamp\": \"{{ $node[\"Build Audit Log Row\"].json.timestamp }}\"\n  }\n}",
          "options": {
            "responseCode": 201,
            "responseHeaders": {
              "entries": [
                {
                  "name": "Content-Type",
                  "value": "application/json; charset=utf-8"
                }
              ]
            }
          }
        }
      },
      {
        "id": "respond_invalid_input",
        "name": "Respond Invalid Input",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.5,
        "position": [
          2960,
          200
        ],
        "parameters": {
          "respondWith": "json",
          "responseBody": "={{ $json.response }}",
          "options": {
            "responseCode": "={{ $json.statusCode }}",
            "responseHeaders": {
              "entries": [
                {
                  "name": "Content-Type",
                  "value": "application/json; charset=utf-8"
                }
              ]
            }
          }
        }
      },
      {
        "id": "respond_unauthorized_token",
        "name": "Respond Unauthorized Token",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.5,
        "position": [
          1040,
          380
        ],
        "parameters": {
          "respondWith": "json",
          "responseBody": "={{ $json.response }}",
          "options": {
            "responseCode": "={{ $json.statusCode }}",
            "responseHeaders": {
              "entries": [
                {
                  "name": "Content-Type",
                  "value": "application/json; charset=utf-8"
                }
              ]
            }
          }
        }
      },
      {
        "id": "respond_invalid_claims",
        "name": "Respond Invalid Claims",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.5,
        "position": [
          1860,
          300
        ],
        "parameters": {
          "respondWith": "json",
          "responseBody": "={{ $json.response }}",
          "options": {
            "responseCode": "={{ $json.statusCode }}",
            "responseHeaders": {
              "entries": [
                {
                  "name": "Content-Type",
                  "value": "application/json; charset=utf-8"
                }
              ]
            }
          }
        }
      },
      {
        "id": "respond_unauthorized_actor",
        "name": "Respond Unauthorized Actor",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.5,
        "position": [
          2700,
          220
        ],
        "parameters": {
          "respondWith": "json",
          "responseBody": "={{ $json.response }}",
          "options": {
            "responseCode": "={{ $json.statusCode }}",
            "responseHeaders": {
              "entries": [
                {
                  "name": "Content-Type",
                  "value": "application/json; charset=utf-8"
                }
              ]
            }
          }
        }
      }
    ],
    "connections": {
      "POST /portal-v1/residents/create": {
        "main": [
          [
            {
              "node": "Extract Bearer Token",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Extract Bearer Token": {
        "main": [
          [
            {
              "node": "Token Present?",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Token Present?": {
        "main": [
          [
            {
              "node": "Verify App JWT",
              "type": "main",
              "index": 0
            }
          ],
          [
            {
              "node": "Respond Unauthorized Token",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Verify App JWT": {
        "main": [
          [
            {
              "node": "Validate App Claims",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Validate App Claims": {
        "main": [
          [
            {
              "node": "Claims Valid?",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Claims Valid?": {
        "main": [
          [
            {
              "node": "Fetch Actor Profile",
              "type": "main",
              "index": 0
            }
          ],
          [
            {
              "node": "Respond Invalid Claims",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Fetch Actor Profile": {
        "main": [
          [
            {
              "node": "Authorize Actor",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Authorize Actor": {
        "main": [
          [
            {
              "node": "Actor Authorized?",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Actor Authorized?": {
        "main": [
          [
            {
              "node": "Validate & Prepare Inputs",
              "type": "main",
              "index": 0
            }
          ],
          [
            {
              "node": "Respond Unauthorized Actor",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Validate & Prepare Inputs": {
        "main": [
          [
            {
              "node": "Inputs Valid?",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Inputs Valid?": {
        "main": [
          [
            {
              "node": "Insert Profile",
              "type": "main",
              "index": 0
            }
          ],
          [
            {
              "node": "Respond Invalid Input",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Insert Profile": {
        "main": [
          [
            {
              "node": "Should Update Unit?",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Should Update Unit?": {
        "main": [
          [
            {
              "node": "Update Unit Occupancy",
              "type": "main",
              "index": 0
            }
          ],
          [
            {
              "node": "Build Audit Log Row",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Update Unit Occupancy": {
        "main": [
          [
            {
              "node": "Build Audit Log Row",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Build Audit Log Row": {
        "main": [
          [
            {
              "node": "Insert Audit Log",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Insert Audit Log": {
        "main": [
          [
            {
              "node": "Respond Success",
              "type": "main",
              "index": 0
            }
          ]
        ]
      }
    },
    "settings": {
      "executionOrder": "v1",
      "availableInMCP": true
    },
    "staticData": null,
    "meta": null,
    "nodeGroups": [],
    "pinData": null,
    "versionId": "4f0e5c73-c63d-4b87-9cde-cde27e75ab66",
    "activeVersionId": "4f0e5c73-c63d-4b87-9cde-cde27e75ab66",
    "versionCounter": 8,
    "triggerCount": 1,
    "sourceWorkflowId": null,
    "shared": [
      {
        "updatedAt": "2026-07-18T16:40:56.358Z",
        "createdAt": "2026-07-18T16:40:56.358Z",
        "role": "workflow:owner",
        "workflowId": "LkUJdTKvdspl3hK4",
        "projectId": "R8ySU59uInTJRnwa",
        "project": {
          "updatedAt": "2025-06-25T23:35:01.341Z",
          "createdAt": "2025-06-25T23:33:47.258Z",
          "id": "R8ySU59uInTJRnwa",
          "name": "Denmas Ganteng <denmas.dyudhiantoro@gmail.com>",
          "type": "personal",
          "icon": null,
          "description": null,
          "customTelemetryTags": [],
          "creatorId": "edc67356-1672-409c-909c-262714d176c4"
        }
      }
    ],
    "tags": []
  }
};
