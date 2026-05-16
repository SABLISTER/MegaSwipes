import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue')
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue')
    },
    {
      path: '/signup',
      name: 'signup',
      component: () => import('../views/SignUpView.vue')
    },
    {
      path: '/datasets',
      name: 'datasets',
      component: () => import('../views/DatasetsView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/swipe/:datasetId',
      name: 'swipe',
      component: () => import('../views/SwipeView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/leaderboard',
      name: 'leaderboard',
      component: () => import('../views/LeaderboardView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('../views/ProfileView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('../views/AdminView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    }
  ]
})

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  
  // Wait for auth to initialize if still loading
  if (authStore.loading) {
    // Wait for loading to complete
    let attempts = 0
    while (authStore.loading && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100))
      attempts++
    }
  }
  
  // Check authentication
  if (to.meta.requiresAuth && !authStore.user) {
    next('/login')
  } else if (to.meta.requiresAdmin && !authStore.isAdmin) {
    // Redirect non-admin users trying to access admin routes
    next('/')
  } else {
    next()
  }
})

export default router
