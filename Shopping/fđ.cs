using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class ServiceLocator : MonoBehaviour
{
    public static ServiceLocator Instance { get; private set; }
    private Dictionary<System.Type, object> _services = new Dictionary<System.Type, object>();

    private void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }
        else
        {
            Destroy(gameObject);
        }
    }

    public void Register<T>(T service) where T : class
    {
        var type = typeof(T);
        if (_services.ContainsKey(type))
        {
            _services[type] = service;
            Debug.LogWarning($"Service {type} already registered. Replacing...");
        }
        else
        {
            _services.Add(type, service);
            Debug.Log($"Service {type} registered successfully.");
        }
    }

    public void UnRegister<T>() where T : class
    {
        var type = typeof(T);
        if (_services.ContainsKey(type))
        {
            _services.Remove(type);
            Debug.Log($"Service {type} unregistered.");
        }
    }

    public T Get<T>() where T : class
    {
        var type = typeof(T);
        if (_services.TryGetValue(type, out var service))
        {
            return service as T;
        }
        else
        {
            Debug.LogError($"Service {type} not found!");
            return null;
        }
    }

    public bool Has<T>() where T : class
    {
        return _services.ContainsKey(typeof(T));
    }
}
