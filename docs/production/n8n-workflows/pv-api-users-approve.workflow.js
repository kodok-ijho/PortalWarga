/**
 * PV API - Users Approve
 * Workflow ID: dih5U9wvmuWHa48Q
 */
module.exports = {
  "success": true,
  "data": {
    "updatedAt": "2026-08-09T09:14:39.103Z",
    "createdAt": "2026-07-09T10:18:54.740Z",
    "id": "dih5U9wvmuWHa48Q",
    "name": "PV API - Users Approve",
    "description": "Protected endpoint that approves pending Google-registered profiles, assigns role/unit with elevated-role restrictions, updates approval metadata, and writes an audit log.",
    "active": true,
    "isArchived": false,
    "nodes": [
      {
        "id": "6200d8ba-7150-4de3-bf69-831d5b22e4f8",
        "name": "POST /portal-v1/users/approve",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2.1,
        "position": [
          180,
          360
        ],
        "parameters": {
          "httpMethod": "POST",
          "path": "portal-v1/users/approve",
          "authentication": "none",
          "responseMode": "responseNode",
          "options": {
            "allowedOrigins": "https://portal-warga.vercel.app,http://localhost:5173,http://127.0.0.1:5173",
            "ignoreBots": true
          }
        },
        "webhookId": "0731dabb-f8e8-435c-b4bf-4ff8f3524463"
      },
      {
        "id": "d2f819e8-b1d9-498d-b3de-c25d5b2d1d22",
        "name": "Extract Bearer Token",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [
          460,
          360
        ],
        "parameters": {
          "mode": "runOnceForAllItems",
          "language": "javaScript",
          "jsCode": "const source = $input.first()?.json ?? {};\nconst body = source.body ?? {};\nconst query = source.query ?? {};\nconst headers = source.headers ?? {};\nconst now = new Date().toISOString();\nconst requestId = headers['x-request-id'] || headers['X-Request-Id'] || body.request_id || query.request_id || 'users_approve_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\nconst authHeader = headers['x-portal-authorization'] || headers['X-Portal-Authorization'] || headers.authorization || headers.Authorization || '';\nconst match = String(authHeader).match(/^Bearer\\s+(.+)$/i);\nfunction failure(statusCode, code, message, details = {}) {\n  return {\n    statusCode,\n    response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } }\n  };\n}\nif (!match || !match[1]) {\n  return [{ json: { tokenPresent: false, request_id: requestId, timestamp: now, ...failure(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan. Silakan login.', {}) } }];\n}\nreturn [{ json: { tokenPresent: true, token: match[1].trim(), request_id: requestId, timestamp: now } }];"
        }
      },
      {
        "id": "69a35ce4-d270-4ece-ba2e-ff2c64538e8f",
        "name": "Token Present?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.3,
        "position": [
          720,
          360
        ],
        "parameters": {
          "conditions": {
            "options": {
              "caseSensitive": true,
              "leftValue": "",
              "typeValidation": "strict",
              "version": 2
            },
            "conditions": [
              {
                "leftValue": "={{ $json.tokenPresent }}",
                "operator": {
                  "type": "boolean",
                  "operation": "true"
                },
                "rightValue": true
              }
            ],
            "combinator": "and"
          }
        }
      },
      {
        "id": "22ecc7a9-2385-4e26-8cee-aa1d504b42b9",
        "name": "Verify App JWT",
        "type": "n8n-nodes-base.jwt",
        "typeVersion": 1,
        "position": [
          1000,
          240
        ],
        "parameters": {
          "operation": "verify",
          "token": "={{ $json.token }}",
          "options": {
            "complete": false,
            "ignoreExpiration": false,
            "ignoreNotBefore": false,
            "clockTolerance": 30,
            "algorithm": "HS256"
          }
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
        "id": "47f1afe0-03db-45fc-bc81-7f5e701ce548",
        "name": "Validate App Claims",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [
          1280,
          240
        ],
        "parameters": {
          "mode": "runOnceForAllItems",
          "language": "javaScript",
          "jsCode": "const input = $input.first()?.json ?? {};\nconst payload = input.payload && typeof input.payload === 'object' ? input.payload : input;\nconst now = new Date().toISOString();\nlet requestId = input.request_id || input.requestId || null;\ntry { requestId = $items('Extract Bearer Token', 0, 0)?.[0]?.json?.request_id || requestId; } catch (error) {}\nrequestId = requestId || 'users_approve_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\nconst expectedIssuer = 'portal-palm-village';\nconst expectedAudience = 'portal-palm-village-web';\nfunction failure(statusCode, code, message, details = {}) {\n  return { claimsValid: false, request_id: requestId, timestamp: now, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n}\nconst aud = payload.aud;\nconst audienceOk = Array.isArray(aud) ? aud.includes(expectedAudience) : aud === expectedAudience;\nif (payload.iss !== expectedIssuer || !audienceOk || !payload.sub) {\n  return [{ json: failure(401, 'INVALID_TOKEN', 'Sesi tidak valid. Silakan login ulang.', {}) }];\n}\nreturn [{ json: { claimsValid: true, request_id: requestId, timestamp: now, sub: payload.sub, email: payload.email ?? null, role: payload.role ?? null, unit_id: payload.unit_id ?? null, approval_status: payload.approval_status ?? null } }];"
        }
      },
      {
        "id": "e94705dc-92a4-4f39-972e-6b47697f682c",
        "name": "Claims Valid?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.3,
        "position": [
          1540,
          240
        ],
        "parameters": {
          "conditions": {
            "options": {
              "caseSensitive": true,
              "leftValue": "",
              "typeValidation": "strict",
              "version": 2
            },
            "conditions": [
              {
                "leftValue": "={{ $json.claimsValid }}",
                "operator": {
                  "type": "boolean",
                  "operation": "true"
                },
                "rightValue": true
              }
            ],
            "combinator": "and"
          }
        }
      },
      {
        "id": "e4771bd7-7f47-47e7-94ca-9bd4c401969c",
        "name": "Fetch Actor Profile",
        "type": "n8n-nodes-base.supabase",
        "typeVersion": 1,
        "position": [
          1820,
          120
        ],
        "parameters": {
          "resource": "row",
          "operation": "getAll",
          "tableId": "profiles",
          "returnAll": false,
          "limit": 1,
          "filterType": "manual",
          "matchType": "allFilters",
          "filters": {
            "conditions": [
              {
                "keyName": "id",
                "condition": "eq",
                "keyValue": "={{ $json.sub }}"
              }
            ]
          }
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
        "id": "bb54e0b0-2040-4357-855b-f22194f7b85c",
        "name": "Authorize Actor",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [
          2100,
          120
        ],
        "parameters": {
          "mode": "runOnceForAllItems",
          "language": "javaScript",
          "jsCode": "const profile = $input.first()?.json ?? {};\nconst now = new Date().toISOString();\nlet requestId = null;\ntry { requestId = $items('Validate App Claims', 0, 0)?.[0]?.json?.request_id || null; } catch (error) {}\nrequestId = requestId || 'users_approve_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\nconst minimumRole = 'pengurus';\nconst rank = { warga: 10, pengurus: 20, bendahara: 30, admin: 40 };\nfunction failure(statusCode, code, message, details = {}) {\n  return { authorized: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n}\nif (!profile.id) { return [{ json: failure(401, 'INVALID_TOKEN', 'Sesi tidak valid. Silakan login ulang.', {}) }]; }\nif (profile.is_active !== true) { return [{ json: failure(403, 'SUSPENDED_USER', 'Akun tidak aktif. Hubungi pengurus.', {}) }]; }\nif (profile.approval_status !== 'approved') { return [{ json: failure(403, 'FORBIDDEN', 'Akun belum dapat mengakses endpoint ini.', { approval_status: profile.approval_status ?? null }) }]; }\nconst actorRank = rank[profile.role] || 0;\nconst minimumRank = rank[minimumRole];\nif (actorRank < minimumRank) {\n  return [{ json: failure(403, 'FORBIDDEN_ROLE', 'Role Anda tidak memiliki akses ke endpoint ini.', { required_role: minimumRole, actor_role: profile.role ?? null }) }];\n}\nreturn [{ json: { authorized: true, request_id: requestId, timestamp: now, actor: { id: profile.id, email: profile.email, role: profile.role }, minimum_role: minimumRole } }];"
        }
      },
      {
        "id": "3d69ee8d-cd9c-4fab-8f31-f75c94170b4a",
        "name": "Actor Authorized?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.3,
        "position": [
          2380,
          120
        ],
        "parameters": {
          "conditions": {
            "options": {
              "caseSensitive": true,
              "leftValue": "",
              "typeValidation": "strict",
              "version": 2
            },
            "conditions": [
              {
                "leftValue": "={{ $json.authorized }}",
                "operator": {
                  "type": "boolean",
                  "operation": "true"
                },
                "rightValue": true
              }
            ],
            "combinator": "and"
          }
        }
      },
      {
        "id": "7da4eced-c88b-424b-a3ca-908db836ce30",
        "name": "Normalize Approval Request",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [
          2660,
          20
        ],
        "parameters": {
          "mode": "runOnceForAllItems",
          "language": "javaScript",
          "jsCode": "const auth = $input.first()?.json ?? {};\nlet webhook = {};\ntry { webhook = $items('POST /portal-v1/users/approve', 0, 0)?.[0]?.json ?? {}; } catch (error) {}\nconst body = webhook.body ?? {};\nconst headers = webhook.headers ?? {};\nconst now = new Date().toISOString();\nconst requestId = auth.request_id || 'users_approve_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\nconst actor = auth.actor ?? {};\nfunction failure(statusCode, code, message, details = {}) {\n  return { requestValid: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n}\nconst profileId = String(body.profile_id ?? body.profileId ?? '').trim();\nconst uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;\nif (!uuidPattern.test(profileId)) {\n  return [{ json: failure(400, 'INVALID_PROFILE_ID', 'profile_id wajib berupa UUID yang valid.', {}) }];\n}\nconst allowedRoles = ['warga', 'pengurus', 'bendahara', 'admin'];\nconst requestedRole = String(body.role ?? 'warga').trim().toLowerCase();\nif (!allowedRoles.includes(requestedRole)) {\n  return [{ json: failure(400, 'INVALID_ROLE', 'Role approval tidak valid.', { allowed_roles: allowedRoles }) }];\n}\nconst rawFullName = body.full_name ?? body.fullName ?? body.name ?? null;\nconst fullName = rawFullName === null || rawFullName === undefined ? null : (String(rawFullName).trim().slice(0, 160) || null);\nconst rawPhone = body.phone ?? body.phone_number ?? body.phoneNumber ?? body.whatsapp ?? null;\nconst phone = rawPhone === null || rawPhone === undefined ? null : (String(rawPhone).trim().slice(0, 40) || null);\nlet unitId = body.unit_id ?? body.unitId ?? null;\nif (unitId === '' || unitId === undefined) unitId = null;\nif (unitId !== null) {\n  const parsed = Number(unitId);\n  if (!Number.isInteger(parsed) || parsed <= 0) {\n    return [{ json: failure(400, 'INVALID_UNIT_ID', 'unit_id wajib berupa angka positif.', {}) }];\n  }\n  unitId = parsed;\n}\nif (requestedRole === 'warga' && unitId === null) {\n  return [{ json: failure(400, 'UNIT_REQUIRED', 'Unit wajib dipilih saat approve warga.', {}) }];\n}\nif (requestedRole !== 'warga' && actor.role !== 'admin') {\n  return [{ json: failure(403, 'ELEVATED_ROLE_FORBIDDEN', 'Hanya admin yang boleh memberi role pengurus, bendahara, atau admin.', { requested_role: requestedRole, actor_role: actor.role ?? null }) }];\n}\nconst allowedOccupancyStatuses = ['owner_occupied', 'owner_vacant', 'owner_rented', 'tenant', 'unknown'];\nlet occupancyStatus = body.occupancy_status ?? body.occupancyStatus ?? null;\nif (occupancyStatus !== null && occupancyStatus !== undefined && occupancyStatus !== '') {\n  occupancyStatus = String(occupancyStatus).trim();\n  if (!allowedOccupancyStatuses.includes(occupancyStatus)) {\n    return [{ json: failure(400, 'INVALID_OCCUPANCY_STATUS', 'Status hunian tidak valid.', { allowed_occupancy_statuses: allowedOccupancyStatuses }) }];\n  }\n} else {\n  occupancyStatus = requestedRole === 'warga' ? 'owner_occupied' : null;\n}\nconst rawNote = body.approval_note ?? body.approvalNote ?? '';\nconst approvalNote = String(rawNote ?? '').trim().slice(0, 500);\nconst forwardedFor = headers['x-forwarded-for'] || headers['X-Forwarded-For'] || headers['cf-connecting-ip'] || headers['CF-Connecting-IP'] || '';\nconst firstIp = String(forwardedFor).split(',')[0].trim();\nconst ipAddress = /^[0-9a-fA-F:.]+$/.test(firstIp) && firstIp.length > 0 ? firstIp : null;\nconst userAgent = headers['user-agent'] || headers['User-Agent'] || null;\nreturn [{ json: { requestValid: true, request_id: requestId, timestamp: now, actor, profile_id: profileId, full_name: fullName, phone, requested_role: requestedRole, unit_id: unitId, unit_lookup_id: unitId === null ? '__skip__' : String(unitId), approval_note: approvalNote, ip_address: ipAddress, user_agent: userAgent, occupancy_status: occupancyStatus } }];"
        }
      },
      {
        "id": "fb7a522c-82cd-49ad-8c51-27686fcf1bc3",
        "name": "Request Valid?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.3,
        "position": [
          2940,
          20
        ],
        "parameters": {
          "conditions": {
            "options": {
              "caseSensitive": true,
              "leftValue": "",
              "typeValidation": "strict",
              "version": 2
            },
            "conditions": [
              {
                "leftValue": "={{ $json.requestValid }}",
                "operator": {
                  "type": "boolean",
                  "operation": "true"
                },
                "rightValue": true
              }
            ],
            "combinator": "and"
          }
        }
      },
      {
        "id": "c1954d9c-138b-4ff7-9e1f-92c265a9ae78",
        "name": "Fetch Target Profile",
        "type": "n8n-nodes-base.supabase",
        "typeVersion": 1,
        "position": [
          3220,
          -80
        ],
        "parameters": {
          "resource": "row",
          "operation": "getAll",
          "tableId": "profiles",
          "returnAll": false,
          "limit": 1,
          "filterType": "manual",
          "matchType": "allFilters",
          "filters": {
            "conditions": [
              {
                "keyName": "id",
                "condition": "eq",
                "keyValue": "={{ $json.profile_id }}"
              }
            ]
          }
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
        "id": "01beabf0-6598-4956-9717-e0cb410c1d25",
        "name": "Validate Target Profile",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [
          3500,
          -80
        ],
        "parameters": {
          "mode": "runOnceForAllItems",
          "language": "javaScript",
          "jsCode": "const target = $input.first()?.json ?? {};\nlet req = {};\ntry { req = $items('Normalize Approval Request', 0, 0)?.[0]?.json ?? {}; } catch (error) {}\nconst now = new Date().toISOString();\nconst requestId = req.request_id || 'users_approve_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\nfunction failure(statusCode, code, message, details = {}) {\n  return { targetValid: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n}\nif (!target.id) {\n  return [{ json: failure(404, 'PROFILE_NOT_FOUND', 'Profile yang akan di-approve tidak ditemukan.', {}) }];\n}\nif (target.id === req.actor?.id) {\n  return [{ json: failure(400, 'SELF_APPROVAL_NOT_ALLOWED', 'Tidak bisa approve akun sendiri melalui endpoint ini.', {}) }];\n}\nif (target.approval_status !== 'pending_approval') {\n  return [{ json: failure(409, 'PROFILE_NOT_PENDING', 'Profile ini tidak berada dalam status menunggu approval.', { approval_status: target.approval_status ?? null }) }];\n}\nif (target.is_active !== true) {\n  return [{ json: failure(409, 'TARGET_INACTIVE', 'Profile target sedang tidak aktif.', {}) }];\n}\nreturn [{ json: { ...req, targetValid: true, timestamp: now, target_before: { id: target.id, email: target.email, full_name: target.full_name, avatar_url: target.avatar_url ?? null, phone: target.phone ?? null, role: target.role, unit_id: target.unit_id ?? null, occupancy_status: target.occupancy_status ?? null, approval_status: target.approval_status, is_active: target.is_active, created_at: target.created_at ?? null } } }];"
        }
      },
      {
        "id": "42b4598b-a20f-451c-be53-f3ae3827a9b5",
        "name": "Target Valid?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.3,
        "position": [
          3780,
          -80
        ],
        "parameters": {
          "conditions": {
            "options": {
              "caseSensitive": true,
              "leftValue": "",
              "typeValidation": "strict",
              "version": 2
            },
            "conditions": [
              {
                "leftValue": "={{ $json.targetValid }}",
                "operator": {
                  "type": "boolean",
                  "operation": "true"
                },
                "rightValue": true
              }
            ],
            "combinator": "and"
          }
        }
      },
      {
        "id": "fe84bd44-0cbf-44a0-9554-b4934b269927",
        "name": "Fetch Requested Unit",
        "type": "n8n-nodes-base.supabase",
        "typeVersion": 1,
        "position": [
          4060,
          -180
        ],
        "parameters": {
          "resource": "row",
          "operation": "getAll",
          "tableId": "units",
          "returnAll": false,
          "limit": 1,
          "filterType": "manual",
          "matchType": "allFilters",
          "filters": {
            "conditions": [
              {
                "keyName": "id",
                "condition": "eq",
                "keyValue": "={{ $json.unit_lookup_id }}"
              }
            ]
          }
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
        "id": "52aed920-7d92-431a-a451-428da24ce5de",
        "name": "Validate Unit and Build Update",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [
          4340,
          -180
        ],
        "parameters": {
          "mode": "runOnceForAllItems",
          "language": "javaScript",
          "jsCode": "const unit = $input.first()?.json ?? {};\nlet req = {};\ntry { req = $items('Validate Target Profile', 0, 0)?.[0]?.json ?? {}; } catch (error) {}\nconst now = new Date().toISOString();\nconst requestId = req.request_id || 'users_approve_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\nfunction failure(statusCode, code, message, details = {}) {\n  return { unitValid: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n}\nif (req.unit_id !== null && !unit.id) {\n  return [{ json: failure(400, 'UNIT_NOT_FOUND', 'Unit yang dipilih tidak ditemukan.', { unit_id: req.unit_id }) }];\n}\nconst unitSafe = unit.id ? { id: unit.id, block: unit.block, unit_number: unit.unit_number, occupancy_status: unit.occupancy_status ?? null, is_occupied: unit.is_occupied ?? null } : null;\nconst fullName = req.full_name ?? req.target_before?.full_name ?? null;\nconst phone = req.phone ?? req.target_before?.phone ?? null;\nreturn [{ json: { ...req, unitValid: true, unit: unitSafe, update: { full_name: fullName, phone, role: req.requested_role, unit_id: req.unit_id, occupancy_status: req.occupancy_status, approval_status: 'approved', is_active: true, approved_by: req.actor.id, approved_at: now, updated_at: now, approval_note: req.approval_note || null } } }];"
        }
      },
      {
        "id": "820de39d-a348-459c-81d5-d203acb1ad7f",
        "name": "Unit Valid?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.3,
        "position": [
          4620,
          -180
        ],
        "parameters": {
          "conditions": {
            "options": {
              "caseSensitive": true,
              "leftValue": "",
              "typeValidation": "strict",
              "version": 2
            },
            "conditions": [
              {
                "leftValue": "={{ $json.unitValid }}",
                "operator": {
                  "type": "boolean",
                  "operation": "true"
                },
                "rightValue": true
              }
            ],
            "combinator": "and"
          }
        }
      },
      {
        "id": "d4d63b7e-de5d-48e9-91d2-afa15a310d5e",
        "name": "Update Target Profile",
        "type": "n8n-nodes-base.supabase",
        "typeVersion": 1,
        "position": [
          4900,
          -280
        ],
        "parameters": {
          "resource": "row",
          "operation": "update",
          "tableId": "profiles",
          "filterType": "manual",
          "matchType": "allFilters",
          "filters": {
            "conditions": [
              {
                "keyName": "id",
                "condition": "eq",
                "keyValue": "={{ $json.profile_id }}"
              }
            ]
          },
          "dataToSend": "defineBelow",
          "fieldsUi": {
            "fieldValues": [
              {
                "fieldId": "full_name",
                "fieldValue": "={{ $json.update.full_name }}"
              },
              {
                "fieldId": "phone",
                "fieldValue": "={{ $json.update.phone }}"
              },
              {
                "fieldId": "role",
                "fieldValue": "={{ $json.update.role }}"
              },
              {
                "fieldId": "unit_id",
                "fieldValue": "={{ $json.update.unit_id === null ? null : $json.update.unit_id }}"
              },
              {
                "fieldId": "occupancy_status",
                "fieldValue": "={{ $json.update.occupancy_status }}"
              },
              {
                "fieldId": "approval_status",
                "fieldValue": "approved"
              },
              {
                "fieldId": "is_active",
                "fieldValue": "={{ true }}"
              },
              {
                "fieldId": "approved_by",
                "fieldValue": "={{ $json.actor.id }}"
              },
              {
                "fieldId": "approved_at",
                "fieldValue": "={{ $json.update.approved_at }}"
              },
              {
                "fieldId": "rejected_by",
                "fieldValue": "={{ null }}"
              },
              {
                "fieldId": "rejected_at",
                "fieldValue": "={{ null }}"
              },
              {
                "fieldId": "approval_note",
                "fieldValue": "={{ $json.update.approval_note }}"
              },
              {
                "fieldId": "updated_at",
                "fieldValue": "={{ $json.update.updated_at }}"
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
        "id": "81176b6d-af30-4040-9a68-ed48c0072836",
        "name": "Build Audit Row",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [
          5740,
          -280
        ],
        "parameters": {
          "mode": "runOnceForAllItems",
          "language": "javaScript",
          "jsCode": "let updated = {};\ntry { updated = $items('Update Target Profile', 0, 0)?.[0]?.json ?? {}; } catch (error) {}\nif (!updated.id) {\n  updated = $input.first()?.json ?? {};\n}\nlet context = {};\ntry { context = $items('Validate Unit and Build Update', 0, 0)?.[0]?.json ?? {}; } catch (error) {}\nconst now = new Date().toISOString();\nconst requestId = context.request_id || 'users_approve_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\nconst approvedUser = {\n  id: updated.id || context.profile_id,\n  email: updated.email || context.target_before?.email || null,\n  full_name: updated.full_name ?? context.update?.full_name ?? context.target_before?.full_name ?? null,\n  avatar_url: updated.avatar_url ?? context.target_before?.avatar_url ?? null,\n  phone: updated.phone ?? context.update?.phone ?? context.target_before?.phone ?? null,\n  role: updated.role || context.update?.role || null,\n  unit_id: updated.unit_id ?? context.update?.unit_id ?? null,\n  occupancy_status: updated.occupancy_status ?? context.update?.occupancy_status ?? null,\n  approval_status: updated.approval_status || 'approved',\n  is_active: updated.is_active ?? true,\n  approved_by: updated.approved_by || context.actor?.id || null,\n  approved_at: updated.approved_at || context.update?.approved_at || null\n};\nconst metadata = {\n  request_id: requestId,\n  target_email: approvedUser.email,\n  previous: { full_name: context.target_before?.full_name ?? null, phone: context.target_before?.phone ?? null, role: context.target_before?.role ?? null, unit_id: context.target_before?.unit_id ?? null, occupancy_status: context.target_before?.occupancy_status ?? null, approval_status: context.target_before?.approval_status ?? null },\n  approved: { full_name: approvedUser.full_name, phone: approvedUser.phone, role: approvedUser.role, unit_id: approvedUser.unit_id, occupancy_status: approvedUser.occupancy_status, approval_status: approvedUser.approval_status, approved_at: approvedUser.approved_at },\n  unit: context.unit ?? null,\n  approval_note: context.approval_note || null\n};\nreturn [{ json: { request_id: requestId, timestamp: now, approved_user: approvedUser, actor: context.actor, audit: { actor_id: context.actor?.id ?? null, actor_email: context.actor?.email ?? null, action: 'user.approve', entity_type: 'profile', entity_id: approvedUser.id, metadata, ip_address: context.ip_address ?? null, user_agent: context.user_agent ?? null } } }];"
        }
      },
      {
        "id": "f0d8ee21-9a3d-4f97-ab8a-ea93ec4f4099",
        "name": "Insert Audit Log",
        "type": "n8n-nodes-base.supabase",
        "typeVersion": 1,
        "position": [
          6020,
          -280
        ],
        "parameters": {
          "resource": "row",
          "operation": "create",
          "tableId": "audit_logs",
          "dataToSend": "defineBelow",
          "fieldsUi": {
            "fieldValues": [
              {
                "fieldId": "actor_id",
                "fieldValue": "={{ $json.audit.actor_id }}"
              },
              {
                "fieldId": "actor_email",
                "fieldValue": "={{ $json.audit.actor_email }}"
              },
              {
                "fieldId": "action",
                "fieldValue": "user.approve"
              },
              {
                "fieldId": "entity_type",
                "fieldValue": "profile"
              },
              {
                "fieldId": "entity_id",
                "fieldValue": "={{ $json.audit.entity_id }}"
              },
              {
                "fieldId": "metadata",
                "fieldValue": "={{ $json.audit.metadata }}"
              },
              {
                "fieldId": "ip_address",
                "fieldValue": "={{ $json.audit.ip_address }}"
              },
              {
                "fieldId": "user_agent",
                "fieldValue": "={{ $json.audit.user_agent }}"
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
        "id": "9807fa68-4572-46b8-b913-7880f7842169",
        "name": "Build Approval Response",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [
          6300,
          -280
        ],
        "parameters": {
          "mode": "runOnceForAllItems",
          "language": "javaScript",
          "jsCode": "let context = {};\ntry { context = $items('Build Audit Row', 0, 0)?.[0]?.json ?? {}; } catch (error) {}\nconst audit = $input.first()?.json ?? {};\nconst now = new Date().toISOString();\nconst requestId = context.request_id || 'users_approve_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\nreturn [{ json: { statusCode: 200, response: { ok: true, data: { user: context.approved_user, audit_id: audit.id ?? null }, error: null, meta: { request_id: requestId, timestamp: now } } } }];"
        }
      },
      {
        "id": "d9c0763a-7851-4e43-8c02-c873cc4ec689",
        "name": "Respond Approval Success",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.5,
        "position": [
          6580,
          -280
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
                },
                {
                  "name": "Cache-Control",
                  "value": "no-store"
                }
              ]
            }
          }
        }
      },
      {
        "id": "1a2bffdd-88e5-406d-8b92-9a7124433444",
        "name": "Respond Unit Error",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.5,
        "position": [
          4900,
          -80
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
                },
                {
                  "name": "Cache-Control",
                  "value": "no-store"
                }
              ]
            }
          }
        }
      },
      {
        "id": "e6f7495a-0bd1-4131-9f81-c8f93a2e5f3b",
        "name": "Respond Target Error",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.5,
        "position": [
          4060,
          80
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
                },
                {
                  "name": "Cache-Control",
                  "value": "no-store"
                }
              ]
            }
          }
        }
      },
      {
        "id": "c0876b9f-5b1e-4897-a3b6-4d6e54ca32a7",
        "name": "Respond Request Error",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.5,
        "position": [
          3220,
          160
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
                },
                {
                  "name": "Cache-Control",
                  "value": "no-store"
                }
              ]
            }
          }
        }
      },
      {
        "id": "93679f0f-2496-4ae5-bd36-f6056478aa80",
        "name": "Respond Forbidden",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.5,
        "position": [
          2660,
          260
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
                },
                {
                  "name": "Cache-Control",
                  "value": "no-store"
                }
              ]
            }
          }
        }
      },
      {
        "id": "20850708-2908-4de6-bd50-8052a3a5051d",
        "name": "Respond Claim Error",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.5,
        "position": [
          1820,
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
                },
                {
                  "name": "Cache-Control",
                  "value": "no-store"
                }
              ]
            }
          }
        }
      },
      {
        "id": "eaf22c26-08fb-41fc-8d04-837466130dd2",
        "name": "Respond Auth Error",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.5,
        "position": [
          1000,
          540
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
                },
                {
                  "name": "Cache-Control",
                  "value": "no-store"
                }
              ]
            }
          }
        }
      },
      {
        "id": "should_update_unit",
        "name": "Should Update Unit?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.3,
        "position": [
          5180,
          -280
        ],
        "parameters": {
          "conditions": {
            "combinator": "and",
            "conditions": [
              {
                "leftValue": "={{ $('Validate Unit and Build Update').item.json.unit_id !== null && $('Validate Unit and Build Update').item.json.occupancy_status !== null }}",
                "operator": {
                  "type": "boolean",
                  "operation": "true"
                },
                "rightValue": true
              }
            ],
            "options": {
              "caseSensitive": true,
              "leftValue": "",
              "typeValidation": "strict",
              "version": 2
            }
          }
        }
      },
      {
        "id": "update_unit_occupancy",
        "name": "Update Unit Occupancy",
        "type": "n8n-nodes-base.supabase",
        "typeVersion": 1,
        "position": [
          5440,
          -400
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
                "keyValue": "={{ $('Validate Unit and Build Update').item.json.unit_id }}"
              }
            ]
          },
          "dataToSend": "defineBelow",
          "fieldsUi": {
            "fieldValues": [
              {
                "fieldId": "occupancy_status",
                "fieldValue": "={{ $('Validate Unit and Build Update').item.json.occupancy_status }}"
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
      }
    ],
    "connections": {
      "POST /portal-v1/users/approve": {
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
              "node": "Respond Auth Error",
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
              "node": "Respond Claim Error",
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
              "node": "Normalize Approval Request",
              "type": "main",
              "index": 0
            }
          ],
          [
            {
              "node": "Respond Forbidden",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Normalize Approval Request": {
        "main": [
          [
            {
              "node": "Request Valid?",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Request Valid?": {
        "main": [
          [
            {
              "node": "Fetch Target Profile",
              "type": "main",
              "index": 0
            }
          ],
          [
            {
              "node": "Respond Request Error",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Fetch Target Profile": {
        "main": [
          [
            {
              "node": "Validate Target Profile",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Validate Target Profile": {
        "main": [
          [
            {
              "node": "Target Valid?",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Target Valid?": {
        "main": [
          [
            {
              "node": "Fetch Requested Unit",
              "type": "main",
              "index": 0
            }
          ],
          [
            {
              "node": "Respond Target Error",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Fetch Requested Unit": {
        "main": [
          [
            {
              "node": "Validate Unit and Build Update",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Validate Unit and Build Update": {
        "main": [
          [
            {
              "node": "Unit Valid?",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Unit Valid?": {
        "main": [
          [
            {
              "node": "Update Target Profile",
              "type": "main",
              "index": 0
            }
          ],
          [
            {
              "node": "Respond Unit Error",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Update Target Profile": {
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
      "Build Audit Row": {
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
              "node": "Build Approval Response",
              "type": "main",
              "index": 0
            }
          ]
        ]
      },
      "Build Approval Response": {
        "main": [
          [
            {
              "node": "Respond Approval Success",
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
              "node": "Build Audit Row",
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
              "node": "Build Audit Row",
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
    "meta": {
      "aiBuilderAssisted": true,
      "builderVariant": "mcp"
    },
    "nodeGroups": [],
    "pinData": null,
    "versionId": "6af39845-0ed7-46c5-aef7-6e0adb55d57c",
    "activeVersionId": "6af39845-0ed7-46c5-aef7-6e0adb55d57c",
    "versionCounter": 8,
    "triggerCount": 1,
    "sourceWorkflowId": null,
    "shared": [
      {
        "updatedAt": "2026-07-09T10:18:54.743Z",
        "createdAt": "2026-07-09T10:18:54.743Z",
        "role": "workflow:owner",
        "workflowId": "dih5U9wvmuWHa48Q",
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
