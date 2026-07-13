# Problem
Firestore's rules engine rejected `where('createdBy', '==', user.uid)` and `where('followers', 'array-contains', user.uid)` queries because of the ternary expressions in `firestore.rules`.
When these queries were rejected, Firebase Web SDK emitted a local cached snapshot first, and then dropped the listener with a Permission Denied error. This caused the UI to briefly show the proposals, but because of the specific way React's state and re-renders interact with Firebase snapshot error callbacks, it cleared the list after ~3 seconds when the server responded with the error.

# Fix
I removed the ternary operators `('field' in resource.data ? resource.data.field : '')` from `firestore.rules` and replaced them with simpler logic: `resource.data.field == request.auth.uid`. Firestore's query engine correctly statically evaluates direct access instead of ternary checks.
